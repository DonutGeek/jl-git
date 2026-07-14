import { GitIdentityAvatar } from "@/components/git/GitIdentityAvatar";
import { cn } from "@/lib/utils";

import type { GitCommitAuthor } from "@/types/git";

interface CommitAuthorAvatarsProps {
  authorName: string;
  authorEmail: string;
  coAuthors: GitCommitAuthor[];
  className?: string;
}

const MAX_VISIBLE = 3;

/**
 * 历史行作者头像叠放：主作者在前，共同作者轻微重叠；最多 3 个，超出 +N。
 */
export function CommitAuthorAvatars({
  authorName,
  authorEmail,
  coAuthors,
  className,
}: CommitAuthorAvatarsProps) {
  const people: GitCommitAuthor[] = [
    { name: authorName, email: authorEmail },
    ...coAuthors.filter(
      (person) =>
        person.email.trim().toLowerCase() !== authorEmail.trim().toLowerCase(),
    ),
  ];

  const visible = people.slice(0, MAX_VISIBLE);
  const overflow = people.length - visible.length;
  const title = people
    .map((person) =>
      person.email ? `${person.name} <${person.email}>` : person.name,
    )
    .join("\n");

  return (
    <div
      className={cn("flex shrink-0 items-center", className)}
      title={title}
      aria-label={title.split("\n").join(", ")}
    >
      <div className="flex items-center">
        {visible.map((person, index) => (
          <GitIdentityAvatar
            key={`${person.email}-${person.name}-${index}`}
            name={person.name}
            email={person.email || null}
            label={person.name}
            shape="rounded"
            compact
            className={cn(
              "border-background size-4 rounded-sm border-2",
              index > 0 && "-ml-1.5",
            )}
          />
        ))}
      </div>
      {overflow > 0 ? (
        <span className="text-muted-foreground ml-0.5 text-[10px] leading-none">
          +{overflow}
        </span>
      ) : null}
    </div>
  );
}
