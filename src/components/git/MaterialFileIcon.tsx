import { cn } from "@/lib/utils";

import { resolveMaterialIconUrl } from "@/utils/materialFileIcon";

interface MaterialFileIconProps {
  name: string;
  isDir: boolean;
  className?: string;
  /** 无障碍：装饰性图标默认隐藏 */
  decorative?: boolean;
}

/**
 * VS Code Material Icon Theme 官方文件/目录图标。
 * 仅用于工作区文件浏览器；应用 UI 图标仍只用 lucide-react。
 */
export function MaterialFileIcon({
  name,
  isDir,
  className,
  decorative = true,
}: MaterialFileIconProps) {
  const src = resolveMaterialIconUrl(name, isDir);

  return (
    <img
      src={src}
      alt=""
      draggable={false}
      className={cn("shrink-0 object-contain", className)}
      aria-hidden={decorative ? true : undefined}
    />
  );
}
