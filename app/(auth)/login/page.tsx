"use client";
import Image from "next/image";
import { useRouter } from "next/navigation";
import { useState } from "react";
import { useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { z } from "zod";
import { ArrowLeft, ArrowRight } from "lucide-react";
import { login, requestPasswordLink } from "@/lib/data/repositories";
import { useApp } from "@/store/app";
import { Button, Field, Input } from "@/components/ui";

const schema = z.object({ email: z.email("Informe um e-mail válido."), password: z.string().min(4, "A senha tem ao menos 4 caracteres.") });
const reset = schema.pick({ email: true });
const DEMO = [{ email: "ana@tchexperiencia.com.br", name: "Ana Ribeiro", role: "Vendedora" }, { email: "rafael@tchexperiencia.com.br", name: "Rafael Monteiro", role: "Gestor" }, { email: "brayan@tchexperiencia.com.br", name: "Brayan", role: "Administrador" }];

function SignIn({ onForgot }: { onForgot: () => void }) {
  const router = useRouter(), signIn = useApp((s) => s.signIn);
  const f = useForm({ resolver: zodResolver(schema), defaultValues: { email: "", password: "" } });
  const enter = async (email: string, password: string) => {
    try { const u = await login(email, password); signIn(u.id); router.push("/insights"); }
    catch (e) { f.setError("password", { message: e instanceof Error ? e.message : "Não foi possível entrar." }); }
  };
  const { errors, isSubmitting } = f.formState;
  return (
    <>
      <form noValidate className="flex flex-col gap-4" onSubmit={f.handleSubmit((v) => enter(v.email, v.password))}>
        <Field label="E-mail" error={errors.email?.message}><Input type="email" autoComplete="username" aria-invalid={!!errors.email} {...f.register("email")} /></Field>
        <Field label="Senha" error={errors.password?.message}><Input type="password" autoComplete="current-password" aria-invalid={!!errors.password} {...f.register("password")} /></Field>
        <Button type="submit" variant="primary" className="mt-1 w-full" disabled={isSubmitting}>{isSubmitting ? "Entrando" : "Entrar"}</Button>
        <button type="button" onClick={onForgot} className="self-center text-tx2 underline-offset-4 hover:text-tx hover:underline">Esqueci minha senha</button>
      </form>
      <div className="mt-8 border-t pt-4">
        <p className="t-label mb-1">Usuários de teste</p>
        {DEMO.map((d) => <button key={d.email} type="button" onClick={() => enter(d.email, "demo")} className="group flex w-full items-center gap-2 border-b py-2.5 text-left last:border-0"><span className="font-medium">{d.name}</span><span className="t-sec flex-1">{d.role}</span><ArrowRight size={15} strokeWidth={1.5} className="text-tx2 group-hover:text-tx" aria-hidden /></button>)}
      </div>
    </>
  );
}
function Forgot({ onBack }: { onBack: () => void }) {
  const [sent, setSent] = useState("");
  const f = useForm({ resolver: zodResolver(reset), defaultValues: { email: "" } });
  const { errors, isSubmitting } = f.formState;
  return (
    <div className="flex flex-col gap-4">
      <h2 className="t-page">{sent ? "Confira seu e-mail" : "Redefinir a senha"}</h2>
      <p className="t-sec">{sent ? `Se houver uma conta para ${sent}, o link chega em alguns minutos e vale por 1 hora.` : "Enviamos um link para você criar uma senha nova."}</p>
      {!sent && <form noValidate className="flex flex-col gap-4" onSubmit={f.handleSubmit(async (v) => { await requestPasswordLink(v.email); setSent(v.email); })}><Field label="E-mail" error={errors.email?.message}><Input type="email" autoFocus autoComplete="username" aria-invalid={!!errors.email} {...f.register("email")} /></Field><Button type="submit" variant="primary" disabled={isSubmitting}>Enviar link</Button></form>}
      <button type="button" onClick={onBack} className="inline-flex items-center gap-1.5 self-start text-tx2 hover:text-tx"><ArrowLeft size={14} strokeWidth={1.5} aria-hidden />Voltar ao login</button>
    </div>
  );
}
export default function LoginPage() {
  const [forgot, setForgot] = useState(false);
  return (
    <main className="flex min-h-dvh flex-col items-center justify-center bg-bg px-5 py-10">
      <div className="w-full max-w-[340px]">
        <h1 className="mb-9 flex justify-center"><Image src="/brand/logo-tch.png" alt="TCH Experiência" width={1107} height={883} priority style={{ width: 168, height: "auto" }} /></h1>
        {forgot ? <Forgot onBack={() => setForgot(false)} /> : <SignIn onForgot={() => setForgot(true)} />}
      </div>
    </main>
  );
}
