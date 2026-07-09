"use client";

import { useEffect, useState } from "react";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { useTranslations } from "@/lib/context/LocaleContext";

function slugify(input: string): string {
  return input
    .toLowerCase()
    .normalize("NFD")
    .replace(/[̀-ͯ]/g, "")
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "")
    .slice(0, 100);
}

interface Props {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  onCreate: (payload: { slug: string; name: string }) => Promise<void> | void;
}

export function NewFormDialog({ open, onOpenChange, onCreate }: Props) {
  const tr = useTranslations();
  const t = tr.admin.newForm;
  const [name, setName] = useState("");
  const [slug, setSlug] = useState("");
  const [slugEdited, setSlugEdited] = useState(false);
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    if (open) {
      setName("");
      setSlug("");
      setSlugEdited(false);
      setBusy(false);
    }
  }, [open]);

  useEffect(() => {
    if (!slugEdited) setSlug(slugify(name));
  }, [name, slugEdited]);

  const disabled = busy || name.trim() === "" || slug.trim() === "";

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    if (disabled) return;
    setBusy(true);
    try {
      await onCreate({ slug: slug.trim(), name: name.trim() });
    } finally {
      setBusy(false);
    }
  }

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent showCloseButton={false} className="max-w-sm">
        <form onSubmit={handleSubmit}>
          <DialogHeader>
            <DialogTitle>{t.title}</DialogTitle>
            <DialogDescription>{t.description}</DialogDescription>
          </DialogHeader>
          <div className="py-4 space-y-3">
            <div className="space-y-1.5">
              <label className="text-xs font-medium text-muted-foreground">{t.nameLabel}</label>
              <Input
                autoFocus
                value={name}
                onChange={(e) => setName(e.target.value)}
                placeholder={t.namePlaceholder}
              />
            </div>
            <div className="space-y-1.5">
              <label className="text-xs font-medium text-muted-foreground">{t.slugLabel}</label>
              <Input
                value={slug}
                onChange={(e) => { setSlugEdited(true); setSlug(e.target.value); }}
                placeholder={t.slugPlaceholder}
              />
              <p className="text-[11px] text-muted-foreground">{t.slugHint.replace("{slug}", slug || "…")}</p>
            </div>
          </div>
          <DialogFooter>
            <Button type="button" variant="outline" size="sm" onClick={() => onOpenChange(false)}>
              {t.cancel}
            </Button>
            <Button type="submit" size="sm" disabled={disabled}>
              {busy ? t.creating : t.confirm}
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}
