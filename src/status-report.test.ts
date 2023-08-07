import test from "ava";
import * as sinon from "sinon";

import * as actionsUtil from "./actions-util";
import { EnvVar } from "./environment";
import { createStatusReportBase } from "./status-report";
import { setupTests, setupActionsVars } from "./testing-utils";
import { withTmpDir } from "./util";

setupTests(test);

test("createStatusReportBase", async (t) => {
  await withTmpDir(async (tmpDir: string) => {
    setupActionsVars(tmpDir, tmpDir);

    process.env["CODEQL_ACTION_ANALYSIS_KEY"] = "analysis-key";
    process.env["GITHUB_REF"] = "refs/heads/main";
    process.env["GITHUB_REPOSITORY"] = "octocat/HelloWorld";
    process.env["GITHUB_RUN_ATTEMPT"] = "2";
    process.env["GITHUB_RUN_ID"] = "100";
    process.env["GITHUB_SHA"] = "a".repeat(40);
    process.env["RUNNER_OS"] = "macOS";

    const getRequiredInput = sinon.stub(actionsUtil, "getRequiredInput");
    getRequiredInput.withArgs("matrix").resolves("input/matrix");

    const statusReport = await createStatusReportBase(
      "init",
      "failure",
      new Date("May 19, 2023 05:19:00"),
      "failure cause",
      "exception stack trace",
    );

    t.assert(typeof statusReport.job_run_uuid === "string");
    t.assert(statusReport.workflow_run_id === 100);
    t.assert(statusReport.workflow_run_attempt === 2);
    t.assert(
      statusReport.workflow_name === (process.env["GITHUB_WORKFLOW"] || ""),
    );
    t.assert(statusReport.job_name === (process.env["GITHUB_JOB"] || ""));
    t.assert(statusReport.analysis_key === "analysis-key");
    t.assert(statusReport.commit_oid === process.env["GITHUB_SHA"]);
    t.assert(statusReport.ref === process.env["GITHUB_REF"]);
    t.assert(statusReport.action_name === "init");
    t.assert(statusReport.action_oid === "unknown");
    t.assert(
      statusReport.started_at === process.env[EnvVar.WORKFLOW_STARTED_AT],
    );
    t.assert(
      statusReport.action_started_at ===
        new Date("May 19, 2023 05:19:00").toISOString(),
    );
    t.assert(statusReport.status === "failure");
    t.assert(statusReport.cause === "failure cause");
    t.assert(statusReport.exception === "exception stack trace");
    t.assert(statusReport.runner_os === process.env["RUNNER_OS"]);
    t.assert(typeof statusReport.action_version === "string");
  });
});
