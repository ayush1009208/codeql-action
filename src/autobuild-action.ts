import * as core from "@actions/core";

import {
  getActionVersion,
  getOptionalInput,
  getTemporaryDirectory,
} from "./actions-util";
import { getGitHubVersion } from "./api-client";
import { determineAutobuildLanguages, runAutobuild } from "./autobuild";
import * as configUtils from "./config-utils";
import { EnvVar } from "./environment";
import { Language } from "./languages";
import { getActionsLogger } from "./logging";
import {
  StatusReportBase,
  getActionsStatus,
  createStatusReportBase,
  sendStatusReport,
} from "./status-report";
import {
  checkGitHubVersionInRange,
  initializeEnvironment,
  wrapError,
} from "./util";

interface AutobuildStatusReport extends StatusReportBase {
  /** Comma-separated set of languages being auto-built. */
  autobuild_languages: string;
  /** Language that failed autobuilding (or undefined if all languages succeeded). */
  autobuild_failure?: string;
}

async function sendCompletedStatusReport(
  startedAt: Date,
  allLanguages: string[],
  failingLanguage?: string,
  cause?: Error,
) {
  initializeEnvironment(getActionVersion());

  const status = getActionsStatus(cause, failingLanguage);
  const statusReportBase = await createStatusReportBase(
    "autobuild",
    status,
    startedAt,
    cause?.message,
    cause?.stack,
  );
  const statusReport: AutobuildStatusReport = {
    ...statusReportBase,
    autobuild_languages: allLanguages.join(","),
    autobuild_failure: failingLanguage,
  };
  await sendStatusReport(statusReport);
}

async function run() {
  const startedAt = new Date();
  const logger = getActionsLogger();
  let currentLanguage: Language | undefined = undefined;
  let languages: Language[] | undefined = undefined;
  try {
    if (
      !(await sendStatusReport(
        await createStatusReportBase("autobuild", "starting", startedAt),
      ))
    ) {
      return;
    }

    const gitHubVersion = await getGitHubVersion();
    checkGitHubVersionInRange(gitHubVersion, logger);

    const config = await configUtils.getConfig(getTemporaryDirectory(), logger);
    if (config === undefined) {
      throw new Error(
        "Config file could not be found at expected location. Has the 'init' action been called?",
      );
    }

    languages = await determineAutobuildLanguages(config, logger);
    if (languages !== undefined) {
      const workingDirectory = getOptionalInput("working-directory");
      if (workingDirectory) {
        logger.info(
          `Changing autobuilder working directory to ${workingDirectory}`,
        );
        process.chdir(workingDirectory);
      }
      for (const language of languages) {
        currentLanguage = language;
        await runAutobuild(language, config, logger);
        if (language === Language.go) {
          core.exportVariable(EnvVar.DID_AUTOBUILD_GOLANG, "true");
        }
      }
    }
  } catch (unwrappedError) {
    const error = wrapError(unwrappedError);
    core.setFailed(
      `We were unable to automatically build your code. Please replace the call to the autobuild action with your custom build steps. ${error.message}`,
    );
    await sendCompletedStatusReport(
      startedAt,
      languages ?? [],
      currentLanguage,
      error,
    );
    return;
  }

  await sendCompletedStatusReport(startedAt, languages ?? []);
}

async function runWrapper() {
  try {
    await run();
  } catch (error) {
    core.setFailed(`autobuild action failed. ${wrapError(error).message}`);
  }
}

void runWrapper();
