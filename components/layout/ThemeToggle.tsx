"use client";
import { Moon, Sun } from "lucide-react";
import { useApp } from "@/store/app";
import { IconButton } from "@/components/ui";

export function ThemeToggle() {
  const { dark, setDark } = useApp();
  return <IconButton icon={dark ? Sun : Moon} label={dark ? "Usar tema claro" : "Usar tema escuro"} onClick={() => setDark(!dark)} />;
}
