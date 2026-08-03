import agent from "./agent.json";
import ai from "./ai.json";
import branchCompare from "./branchCompare.json";
import branchHistory from "./branchHistory.json";
import commitHistory from "./commitHistory.json";
import branchManage from "./branchManage.json";
import common from "./common.json";
import dashboard from "./dashboard.json";
import fileHistory from "./fileHistory.json";
import cloneRepo from "./cloneRepo.json";
import openRepo from "./openRepo.json";
import opLog from "./opLog.json";
import projectManager from "./projectManager.json";
import repo from "./repo.json";
import multiAgent from "./multiAgent.json";
import settings from "./settings.json";
import statusBar from "./statusBar.json";

/** 按域拆分的中文文案，合并为 translation 资源树 */
const zhCN = {
  common,
  statusBar,
  opLog,
  settings,
  dashboard,
  projectManager,
  openRepo,
  cloneRepo,
  ai,
  agent,
  branchCompare,
  branchHistory,
  commitHistory,
  branchManage,
  fileHistory,
  repo,
  multiAgent,
};

export default zhCN;
