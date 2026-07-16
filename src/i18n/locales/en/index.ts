import agent from "./agent.json";
import ai from "./ai.json";
import branchCompare from "./branchCompare.json";
import common from "./common.json";
import dashboard from "./dashboard.json";
import openRepo from "./openRepo.json";
import opLog from "./opLog.json";
import projectManager from "./projectManager.json";
import repo from "./repo.json";
import settings from "./settings.json";
import statusBar from "./statusBar.json";

/** 按域拆分的英文文案，合并为 translation 资源树 */
const en = {
  common,
  statusBar,
  opLog,
  settings,
  dashboard,
  projectManager,
  openRepo,
  ai,
  agent,
  branchCompare,
  repo,
};

export default en;
