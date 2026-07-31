import { useEffect, useState } from "react";
import { User } from "lucide-react";

import { Avatar, AvatarFallback, AvatarImage } from "@/components/ui/avatar";
import { cn } from "@/lib/utils";

import { loadAvatarObjectUrl } from "@/utils/avatarUrl";

interface GitIdentityAvatarProps {
  name: string | null;
  email: string | null;
  className?: string;
  /** 无障碍标签 */
  label: string;
  /** 列表密排：更小字号 / 单字缩写 */
  compact?: boolean;
}

/** Git 身份头像：统一 `rounded-md`（--radius-md），失败回退默认图标 */
export function GitIdentityAvatar({
  name,
  email,
  className,
  label,
  compact = false,
}: GitIdentityAvatarProps) {
  const [objectUrl, setObjectUrl] = useState<string | null>(null);

  useEffect(() => {
    let cancelled = false;
    let createdUrl: string | null = null;
    setObjectUrl(null);

    if (!email?.trim() && !name?.trim()) {
      return;
    }

    void loadAvatarObjectUrl(email, name, compact ? 64 : 96)
      .then((url) => {
        if (cancelled) {
          if (url) {
            URL.revokeObjectURL(url);
          }
          return;
        }
        createdUrl = url;
        setObjectUrl(url);
      })
      .catch(() => {
        if (!cancelled) {
          setObjectUrl(null);
        }
      });

    return () => {
      cancelled = true;
      if (createdUrl) {
        URL.revokeObjectURL(createdUrl);
      }
    };
  }, [email, name, compact]);

  return (
    <Avatar
      className={cn(
        "border-border size-9 border",
        compact && "text-[9px]",
        className,
        // 覆盖 shadcn Avatar 默认 rounded-full，统一 --radius-md
        "rounded-md",
      )}
      aria-label={label}
      title={name ?? email ?? undefined}
    >
      {objectUrl ? <AvatarImage key={objectUrl} src={objectUrl} alt="" /> : null}
      <AvatarFallback className={cn(compact && "text-[9px]", "rounded-md")}>
        <User className={cn(compact ? "size-2.5" : "size-3.5")} aria-hidden="true" />
      </AvatarFallback>
    </Avatar>
  );
}
