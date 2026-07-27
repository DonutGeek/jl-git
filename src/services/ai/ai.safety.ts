import i18n from "@/i18n";
import type { AgentChatMessage } from "@/types/ai";

export type AgentSafetyRisk =
  "credential-theft" | "malware" | "unauthorized-access" | "fraud" | "violent-or-illicit-harm";

interface AgentSafetyRule {
  risk: AgentSafetyRisk;
  patterns: readonly RegExp[];
}

const SAFE_OBJECTIVE =
  "检测|识别|分析|审计|防御|阻止|移除|清理|修复|响应|取证|合规|detect|identify|analy[sz]e|audit|defend|prevent|remove|remediate|respond|forensic|compliance";
const SAFE_GAP = `(?!${SAFE_OBJECTIVE})`;
const BUILD_ACTION_ZH = "编写|生成|创建|制作|开发|实现|添加|增加|加入|加上|补充";
const BUILD_ACTION_EN = "write|create|build|generate|develop|implement|add|include";

const AGENT_SAFETY_RULES: readonly AgentSafetyRule[] = [
  {
    risk: "credential-theft",
    patterns: [
      new RegExp(
        `(?:${BUILD_ACTION_ZH})(?:${SAFE_GAP}.){0,60}(?:窃取|盗取|偷取|套取|截获|外传)(?:.{0,24})(?:密码|口令|凭据|令牌|token|cookie|私钥|助记词|验证码)`,
        "iu",
      ),
      new RegExp(
        `(?:如何|怎么|教我)(?:${SAFE_GAP}.){0,40}(?:窃取|盗取|偷取|套取|截获)(?:.{0,24})(?:密码|口令|凭据|令牌|token|cookie|私钥|助记词|验证码)`,
        "iu",
      ),
      new RegExp(
        `(?:${BUILD_ACTION_EN})(?:${SAFE_GAP}.){0,80}(?:steal|exfiltrate|harvest|dump)(?:.{0,30})(?:passwords?|credentials?|tokens?|cookies?|private keys?|seed phrases?|one-time codes?)`,
        "iu",
      ),
      new RegExp(
        `(?:how (?:do|can) i|teach me to)(?:${SAFE_GAP}.){0,60}(?:steal|exfiltrate|harvest|dump)(?:.{0,30})(?:passwords?|credentials?|tokens?|cookies?|private keys?|seed phrases?)`,
        "iu",
      ),
    ],
  },
  {
    risk: "malware",
    patterns: [
      new RegExp(
        `(?:${BUILD_ACTION_ZH})(?:${SAFE_GAP}.){0,48}(?:勒索软件|木马|键盘记录器|后门程序|僵尸网络|恶意软件|窃密程序|计算机病毒)`,
        "iu",
      ),
      new RegExp(
        `(?:${BUILD_ACTION_EN})(?:${SAFE_GAP}.){0,64}(?:ransomware|keylogger|backdoor|botnet|malware|credential stealer|computer virus)`,
        "iu",
      ),
      new RegExp(
        `(?:帮我|如何|怎么|教我|实现|制作|编写)(?:${SAFE_GAP}.){0,48}(?:免杀|绕过杀毒|规避\\s*(?:EDR|杀毒软件)|关闭\\s*(?:EDR|杀毒软件))`,
        "iu",
      ),
      new RegExp(
        `(?:help me|how (?:do|can) i|write|build|implement)(?:${SAFE_GAP}.){0,64}(?:evade|bypass|disable)(?:.{0,20})(?:antivirus|anti-virus|EDR|endpoint detection)`,
        "iu",
      ),
    ],
  },
  {
    risk: "unauthorized-access",
    patterns: [
      new RegExp(
        `(?:帮我|如何|怎么|教我|编写|生成|创建|实现)(?:${SAFE_GAP}.){0,56}(?:绕过|破解|规避)(?:.{0,20})(?:登录|认证|鉴权|双因素|多因素|MFA|验证码|访问控制|权限校验)`,
        "iu",
      ),
      /(?:未授权|未经允许|黑进|入侵)(?:.{0,36})(?:账户|账号|服务器|系统|网站|仓库|网络)/iu,
      new RegExp(
        `(?:help me|how (?:do|can) i|write|build)(?:${SAFE_GAP}.){0,72}(?:bypass|crack|defeat)(?:.{0,24})(?:login|authentication|authorization|2FA|MFA|access control|permissions?)`,
        "iu",
      ),
      /(?:without (?:permission|authorization)|unauthorized(?:ly)?|break into)(?:.{0,48})(?:account|server|system|website|repository|network)/iu,
    ],
  },
  {
    risk: "fraud",
    patterns: [
      new RegExp(
        `(?:${BUILD_ACTION_ZH})(?:${SAFE_GAP}.){0,48}(?:钓鱼邮件|钓鱼页面|钓鱼网站|诈骗脚本|虚假发票|伪造身份|盗刷)`,
        "iu",
      ),
      new RegExp(
        `(?:${BUILD_ACTION_EN})(?:${SAFE_GAP}.){0,64}(?:phishing email|phishing page|phishing site|scam script|fake invoice|identity forgery|carding)`,
        "iu",
      ),
    ],
  },
  {
    risk: "violent-or-illicit-harm",
    patterns: [
      new RegExp(
        `(?:帮我|教我|如何|怎么|${BUILD_ACTION_ZH}|制造|合成)(?:${SAFE_GAP}.){0,48}(?:爆炸物|炸弹|毒气|冰毒|甲基苯丙胺)`,
        "iu",
      ),
      new RegExp(
        `(?:help me|teach me|how (?:do|can) i|${BUILD_ACTION_EN}|manufacture|synthesize)(?:${SAFE_GAP}.){0,64}(?:explosive|bomb|poison gas|methamphetamine)`,
        "iu",
      ),
    ],
  },
] as const;

/** 仅拦截高置信度恶意请求；更广的灰区由系统安全 Prompt 处理。 */
export function detectAgentSafetyRisk(
  messages: readonly AgentChatMessage[],
): AgentSafetyRisk | null {
  const lastUser = [...messages].reverse().find((message) => message.role === "user");
  if (!lastUser) {
    return null;
  }
  const content = lastUser.content.normalize("NFKC").slice(0, 8_000);
  for (const rule of AGENT_SAFETY_RULES) {
    if (rule.patterns.some((pattern) => pattern.test(content))) {
      return rule.risk;
    }
  }
  return null;
}

/** 命中高置信度风险时返回本地拒绝文案，且不读取仓库、不调用模型。 */
export function getAgentSafetyRefusal(
  messages: readonly AgentChatMessage[],
  locale: string,
): string | null {
  if (!detectAgentSafetyRisk(messages)) {
    return null;
  }
  return i18n.t("agent.safetyBlocked", { lng: locale });
}
