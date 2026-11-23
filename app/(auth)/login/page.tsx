"use client";
import Image from "next/image";
import { useRouter } from "next/navigation";
import { useId, useRef, useState, type ComponentProps, type ReactNode } from "react";
import { useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { z } from "zod";
import { ArrowLeft, ChevronDown, Eye, EyeOff } from "lucide-react";
import { login, requestPasswordLink } from "@/lib/data/repositories";
import { useApp } from "@/store/app";

const schema = z.object({ email: z.email("Informe um e-mail válido."), password: z.string().min(4, "A senha tem ao menos 4 caracteres.") });
const reset = schema.pick({ email: true });
/* Só em desenvolvimento ou com NEXT_PUBLIC_DEMO_ACCESS=1. Sem isso, o build descarta esta lista. */
const DEMO = process.env.NODE_ENV === "development" || process.env.NEXT_PUBLIC_DEMO_ACCESS === "1"
  ? [{ email: "ana@tchexperiencia.com.br", name: "Ana Ribeiro", role: "Vendedora" }, { email: "rafael@tchexperiencia.com.br", name: "Rafael Monteiro", role: "Gestor" }, { email: "brayan@tchexperiencia.com.br", name: "Brayan", role: "Administrador" }]
  : null;

const LINK = "rounded-tag text-[13px] text-tx2 underline-offset-4 transition-colors hover:text-tx hover:underline disabled:pointer-events-none";
function LoginField({ label, error, end, aside, ...input }: ComponentProps<"input"> & { label: string; error?: string; end?: ReactNode; aside?: ReactNode }) {
  const id = useId();
  return (
    <div className="relative">
      <label htmlFor={id} className="block pb-2 text-[14px] font-medium leading-5">{label}</label>
      <div className="relative">
        <input id={id} aria-invalid={!!error} aria-describedby={error ? `${id}-erro` : undefined} className={`login-input ${end ? "pr-12" : ""}`} {...input} />
        {end}
      </div>
      {aside}
      {error && <p id={`${id}-erro`} role="alert" className="mt-2 text-[13px] leading-[18px] text-alert">{error}</p>}
    </div>
  );
}
function Submit({ busy, idle, loading }: { busy: boolean; idle: string; loading: string }) {
  return <button type="submit" disabled={busy} aria-busy={busy} className="h-12 w-full rounded-card bg-gold text-[15px] font-semibold text-[var(--ink)] transition-colors hover:bg-[var(--gold-lt)] active:bg-gold disabled:cursor-wait disabled:opacity-70">{busy ? loading : idle}</button>;
}
function Heading({ title, text }: { title: string; text: string }) {
  return <header className="mb-8"><h1 className="text-[30px] font-semibold leading-9 tracking-[-0.02em]">{title}</h1><p className="mt-2 text-[14px] leading-[22px] text-tx2 [overflow-wrap:anywhere]">{text}</p></header>;
}

function SignIn({ onForgot }: { onForgot: () => void }) {
  const router = useRouter(), signIn = useApp((s) => s.signIn);
  const f = useForm({ resolver: zodResolver(schema), defaultValues: { email: "", password: "" } });
  const [show, setShow] = useState(false), [busy, setBusy] = useState(false);
  const lock = useRef(false);
  const enter = async (email: string, password: string) => {
    if (lock.current) return; // bloqueia envio duplicado
    lock.current = true; setBusy(true); f.clearErrors();
    try { const u = await login(email, password); signIn(u.id); router.push("/insights"); } // segue bloqueado até o redirecionamento
    catch (e) { f.setError("root", { message: e instanceof Error ? e.message : "Não foi possível entrar." }); lock.current = false; setBusy(false); }
  };
  const { errors } = f.formState;
  return (
    <>
      <Heading title="Acesse seu CRM" text="Entre com sua conta para continuar." />
      <form noValidate method="post" className="flex flex-col gap-5" onSubmit={f.handleSubmit((v) => enter(v.email, v.password))}>
        <LoginField label="E-mail" type="email" inputMode="email" autoComplete="username" autoCapitalize="none" spellCheck={false} placeholder="voce@empresa.com.br" readOnly={busy} error={errors.email?.message} {...f.register("email")} />
        <LoginField label="Senha" type={show ? "text" : "password"} autoComplete="current-password" autoCapitalize="none" spellCheck={false} readOnly={busy} error={errors.password?.message} {...f.register("password")}
          end={<button type="button" onClick={() => setShow(!show)} aria-label={show ? "Ocultar senha" : "Mostrar senha"} title={show ? "Ocultar senha" : "Mostrar senha"} className="absolute right-0.5 top-0.5 inline-flex size-11 items-center justify-center rounded-ctl text-tx2 outline-offset-[-4px] transition-colors hover:text-tx">{show ? <EyeOff size={18} strokeWidth={1.5} aria-hidden /> : <Eye size={18} strokeWidth={1.5} aria-hidden />}</button>}
          aside={<button type="button" disabled={busy} onClick={onForgot} className={`${LINK} absolute -top-3 right-0 h-11`}>Esqueci minha senha</button>} />
        {errors.root && <p role="alert" className="rounded-card border border-alert/50 px-3.5 py-2.5 text-[13px] leading-[18px] text-alert">{errors.root.message}</p>}
        <div className="pt-1"><Submit busy={busy} idle="Entrar" loading="Entrando…" /></div>
      </form>
      {DEMO && (
        <details className="group mt-8 border-t border-line pt-2">
          <summary className="flex h-11 list-none items-center rounded-ctl text-[13px] text-tx2 hover:text-tx [&::-webkit-details-marker]:hidden"><span className="flex-1">Acessos de demonstração</span><ChevronDown size={16} strokeWidth={1.5} className="transition-transform group-open:rotate-180" aria-hidden /></summary>
          <ul>{DEMO.map((d) => <li key={d.email}><button type="button" disabled={busy} onClick={() => void enter(d.email, "demo")} className="-mx-3 flex h-11 w-[calc(100%+24px)] items-center justify-between rounded-ctl px-3 text-[13px] transition-colors hover:bg-bg2"><span className="font-medium">{d.name}</span><span className="text-tx2">{d.role}</span></button></li>)}</ul>
        </details>
      )}
    </>
  );
}
function Forgot({ onBack }: { onBack: () => void }) {
  const [sent, setSent] = useState("");
  const f = useForm({ resolver: zodResolver(reset), defaultValues: { email: "" } });
  const { errors, isSubmitting } = f.formState;
  const send = f.handleSubmit(async (v) => {
    try { await requestPasswordLink(v.email); setSent(v.email); }
    catch { f.setError("root", { message: "Não foi possível enviar o link. Tente de novo." }); }
  });
  return (
    <>
      <Heading title={sent ? "Confira seu e-mail" : "Redefinir a senha"} text={sent ? `Se houver uma conta para ${sent}, o link chega em alguns minutos e vale por 1 hora.` : "Enviamos um link para você criar uma senha nova."} />
      {!sent && (
        <form noValidate method="post" className="flex flex-col gap-5" onSubmit={send}>
          <LoginField label="E-mail" type="email" inputMode="email" autoFocus autoComplete="username" autoCapitalize="none" spellCheck={false} placeholder="voce@empresa.com.br" readOnly={isSubmitting} error={errors.email?.message} {...f.register("email")} />
          {errors.root && <p role="alert" className="text-[13px] text-alert">{errors.root.message}</p>}
          <Submit busy={isSubmitting} idle="Enviar link" loading="Enviando…" />
        </form>
      )}
      <button type="button" onClick={onBack} className={`${LINK} mt-4 inline-flex h-11 items-center gap-2`}><ArrowLeft size={16} strokeWidth={1.5} aria-hidden />Voltar ao login</button>
    </>
  );
}
export default function LoginPage() {
  const [forgot, setForgot] = useState(false);
  return (
    <main className="login-screen min-h-dvh bg-bg text-tx min-[900px]:grid min-[900px]:grid-cols-[55fr_45fr]">
      <section aria-label="TCH Experiência" className="relative hidden flex-col justify-between gap-16 overflow-hidden bg-side p-12 min-[900px]:flex xl:p-16">
        <Image src="/brand/ambiente-tch.jpg" alt="" fill sizes="(max-width: 899px) 1px, 55vw" className="object-cover object-[50%_35%]" />
        <div aria-hidden className="absolute inset-0 bg-[rgba(16,16,16,0.78)]" />
        <Image src="/brand/logo-branco.png" alt="TCH Experiência" width={900} height={153} priority className="relative" style={{ width: 160, height: "auto" }} />
        <div className="relative max-w-[520px]">
          <p className="mb-4 text-[12px] font-medium tracking-[0.06em] text-gold">TCH EXPERIÊNCIA · CRM</p>
          <p className="text-balance text-[40px] font-semibold leading-[1.12] tracking-[-0.025em] xl:text-[46px]">Relacionamentos que geram negócios.</p>
          <p className="mt-6 max-w-[430px] text-[16px] leading-[25px] text-tx/90">Seu atendimento, suas oportunidades e seus próximos passos em um só lugar.</p>
        </div>
      </section>
      <section aria-label="Acesso" className="flex min-h-dvh flex-col items-center border-line px-6 pb-6 pt-12 min-[900px]:min-h-0 min-[900px]:border-l">
        <div className="my-auto w-full max-w-[372px]">
          <Image src="/brand/logo-branco.png" alt="TCH Experiência" width={900} height={153} priority className="mb-8 min-[900px]:hidden" style={{ width: 148, height: "auto" }} />
          {forgot ? <Forgot onBack={() => setForgot(false)} /> : <SignIn onForgot={() => setForgot(true)} />}
        </div>
        <footer className="pt-12 text-[12px] leading-4 text-tx2">TCH Experiência · Gestão comercial</footer>
      </section>
    </main>
  );
}
