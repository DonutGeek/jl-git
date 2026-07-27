import { Children, Fragment, isValidElement, type ReactElement, type ReactNode } from "react";

import { ItemGroup, ItemSeparator } from "@/components/ui/item";
import { cn } from "@/lib/utils";

/** 设置偏好分组：与数据「清理缓存」同系，基于 shadcn ItemGroup */
export function SettingsPreferenceGroup({
  children,
  className,
}: {
  children: ReactNode;
  className?: string;
}) {
  const items = Children.toArray(children).filter(Boolean);

  return (
    <ItemGroup className={cn("border-border overflow-hidden rounded-md border", className)}>
      {items.map((child, index) => {
        const key = isValidElement(child) && child.key != null ? child.key : `pref-row-${index}`;
        return (
          <Fragment key={key}>
            {index > 0 ? <ItemSeparator /> : null}
            {child as ReactElement}
          </Fragment>
        );
      })}
    </ItemGroup>
  );
}
