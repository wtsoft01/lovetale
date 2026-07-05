import { cn } from "@/lib/utils";

type BrandLogoProps = {
  className?: string;
  imageClassName?: string;
};

export function BrandLogo({ className, imageClassName }: BrandLogoProps) {
  return (
    <span className={cn("relative inline-block overflow-hidden", className)}>
      <img
        src="/lovetale-logo.png"
        alt="Lovetale"
        className={cn("block h-full w-full object-contain object-left light:hidden", imageClassName)}
      />
      <img
        src="/lovetale-logo-light.png"
        alt="Lovetale"
        className={cn("hidden h-full w-full object-contain object-left light:block", imageClassName)}
      />
    </span>
  );
}
