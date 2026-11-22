"use client";
import { useParams } from "next/navigation";
import { Insights } from "@/components/insights/Insights";
export default function PainelPage() { const { painel } = useParams<{ painel: string }>(); return <Insights panel={painel} />; }
