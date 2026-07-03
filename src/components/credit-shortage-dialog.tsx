import { Link } from "@tanstack/react-router";
import { Coins, Crown, Gift, Sparkles } from "lucide-react";

import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";

type CreditShortageDialogProps = {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  requiredCredits?: number;
  currentCredits?: number;
  title?: string;
  description?: string;
};

export function CreditShortageDialog({
  open,
  onOpenChange,
  requiredCredits,
  currentCredits,
  title = "크레딧이 조금 부족해요",
  description = "무료 보상으로 먼저 체험하거나, 충전,구독으로 바로 이어갈 수 있어요.",
}: CreditShortageDialogProps) {
  const hasBalanceInfo =
    typeof requiredCredits === "number" && typeof currentCredits === "number";
  const missingCredits = hasBalanceInfo
    ? Math.max(0, requiredCredits - currentCredits)
    : undefined;

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-md overflow-hidden border-border/70 bg-background/95 p-0">
        <div className="bg-gradient-to-br from-primary/14 via-sky-500/10 to-amber-300/10 px-5 py-5">
          <DialogHeader>
            <div className="mb-2 flex h-11 w-11 items-center justify-center rounded-full border border-primary/25 bg-primary/15 text-primary">
              <Coins className="h-5 w-5" />
            </div>
            <DialogTitle className="text-xl">{title}</DialogTitle>
            <DialogDescription className="text-sm leading-relaxed">
              {description}
            </DialogDescription>
          </DialogHeader>
        </div>

        {hasBalanceInfo && (
          <div className="mx-5 mt-5 grid grid-cols-3 gap-2 text-center text-xs">
            <div className="rounded-xl border border-border/60 bg-muted/30 px-2 py-3">
              <div className="text-muted-foreground">필요</div>
              <div className="mt-1 font-bold text-foreground">{requiredCredits}</div>
            </div>
            <div className="rounded-xl border border-border/60 bg-muted/30 px-2 py-3">
              <div className="text-muted-foreground">보유</div>
              <div className="mt-1 font-bold text-foreground">{currentCredits}</div>
            </div>
            <div className="rounded-xl border border-primary/25 bg-primary/10 px-2 py-3">
              <div className="text-primary">부족</div>
              <div className="mt-1 font-bold text-primary">{missingCredits}</div>
            </div>
          </div>
        )}

        <div className="px-5 py-4">
          <div className="grid gap-2">
            <Button asChild className="justify-start rounded-xl">
              <Link to="/rewards">
                <Gift className="mr-2 h-4 w-4" />
                무료크래딧
              </Link>
            </Button>
            <Button asChild variant="outline" className="justify-start rounded-xl">
              <Link to="/premium">
                <Crown className="mr-2 h-4 w-4 text-amber-400" />
                충전,구독 보기
              </Link>
            </Button>
          </div>
          <div className="mt-3 flex items-center gap-1.5 text-xs text-muted-foreground">
            <Sparkles className="h-3.5 w-3.5 text-sky-400" />
            출석, 프로필 완성, 첫 스토리 시작으로도 크레딧을 받을 수 있어요.
          </div>
        </div>

        <DialogFooter className="border-t border-border/60 px-5 py-3">
          <Button variant="ghost" onClick={() => onOpenChange(false)}>
            닫기
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
