declare module "vue-router" {
  interface RouteMeta {
    /** i18n key，用于标签 / 子窗标题 */
    title?: string;
    /** 子窗是否由 PageLayout 画标题栏 */
    windowHeader?: boolean;
    /** 标题栏图标（经 `@/components/Icon`） */
    headerIcon?: string;
    /** 对齐 vben：内嵌外链时由 iframe 布局消费 */
    frameSrc?: string;
  }
}

export {};
