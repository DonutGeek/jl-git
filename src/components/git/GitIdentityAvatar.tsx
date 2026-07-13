import { useEffect, useState } from "react";
import { User } from "lucide-react";

import { Avatar, AvatarFallback, AvatarImage } from "@/components/ui/avatar";
import { cn } from "@/lib/utils";

import { avatarUrlFromEmail, initialsFromName } from "@/utils/avatarUrl";

interface GitIdentityAvatarProps {
  name: string | null;
  email: string | null;
  className?: string;
  /** 无障碍标签 */
  label: string;
  /** 列表密排：更小字号 / 单字缩写 */
  compact?: boolean;
}

/** Git 身份头像：shadcn Avatar + Libravatar，失败则缩写 / 默认图标 */
export function GitIdentityAvatar({
  name,
  email,
  className,
  label,
  compact = false,
}: GitIdentityAvatarProps) {
  const [remoteUrl, setRemoteUrl] = useState<string | null>(null);
  const [imageFailed, setImageFailed] = useState(false);

  useEffect(() => {
    let cancelled = false;
    setRemoteUrl(null);
    setImageFailed(false);

    if (!email?.trim()) {
      return;
    }

    void avatarUrlFromEmail(email).then((url) => {
      if (!cancelled) {
        setRemoteUrl(url);
      }
    });

    return () => {
      cancelled = true;
    };
  }, [email]);

  const showImage = Boolean(remoteUrl) && !imageFailed;
  const initials = initialsFromName(name);
  const fallbackText = compact ? initials.slice(0, 1) : initials;

  return (
    <Avatar
      className={cn(
        "border-border size-9 border",
        compact && "text-[9px]",
        className,
      )}
      aria-label={label}
      title={name ?? email ?? undefined}
    >
      {showImage ? (
        <AvatarImage
          src={remoteUrl!}
          alt=""
          onError={() => setImageFailed(true)}
        />
      ) : null}
      <AvatarFallback className={compact ? "text-[9px]" : undefined}>
        {name?.trim() ? (
          <span aria-hidden="true">{fallbackText}</span>
        ) : (
          <User className={cn(compact ? "size-2.5" : "size-3.5")} aria-hidden="true" />
        )}
      </AvatarFallback>
    </Avatar>
  );
}
