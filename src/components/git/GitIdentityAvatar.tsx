import { useEffect, useState } from "react";
import { User } from "lucide-react";

import { cn } from "@/lib/utils";

import { avatarUrlFromEmail, initialsFromName } from "@/utils/avatarUrl";

interface GitIdentityAvatarProps {
  name: string | null;
  email: string | null;
  className?: string;
  /** 无障碍标签 */
  label: string;
}

/** Git 身份头像：优先远程公开头像，失败则显示姓名缩写 / 默认图标 */
export function GitIdentityAvatar({
  name,
  email,
  className,
  label,
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

  return (
    <div
      className={cn(
        "bg-muted text-muted-foreground border-border relative flex size-9 shrink-0 items-center justify-center overflow-hidden rounded-md border text-xs font-medium select-none",
        className,
      )}
      role="img"
      aria-label={label}
      title={name ?? email ?? undefined}
    >
      {showImage ? (
        <img
          src={remoteUrl!}
          alt=""
          className="size-full object-cover"
          onError={() => setImageFailed(true)}
        />
      ) : name?.trim() ? (
        <span aria-hidden="true">{initials}</span>
      ) : (
        <User className="size-4" aria-hidden="true" />
      )}
    </div>
  );
}
