export const BRAND = {
  fullName: 'ForgeCrew',
  displayName: 'ForgeCrew',
  slogan: 'One idea in. A crew ships it.',
  storeTitle: 'ForgeCrew · Agent crew from idea to acceptance',
  packageName: 'com.naodongshigong.app',
  version: '1.0.0',
  palette: {
    constructionYellow: '#FFB800',
    deepGray: '#1F2937',
    lightningWhite: '#FFFFFF',
  },
  roleNames: {
    ORCHESTRATOR: '调度工种',
    PRODUCT: '产品工种',
    BUILDER: '开发工种',
    REVIEWER: '审查工种',
    USER: '你',
    SYSTEM: '系统',
  },
  teamName: '施工队',
  logName: '施工日志',
  reviewDeskName: '验收台',
  reworkName: '返工单',
  acceptName: '验收通过',
} as const;

export type RoleKey = keyof typeof BRAND.roleNames;
