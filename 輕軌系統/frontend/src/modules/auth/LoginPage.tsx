import { zodResolver } from "@hookform/resolvers/zod";
import { KeyRound, LogIn, TrainFront } from "lucide-react";
import { useState } from "react";
import { useForm } from "react-hook-form";
import { Navigate, useLocation, useNavigate } from "react-router-dom";
import { z } from "zod";
import { ApiError } from "../../shared/api/client";
import { authMode } from "../../shared/api/config";
import { useAuth } from "../../shared/auth/AuthContext";
import { roleLabels, userRoles } from "../../shared/types/auth";

const previewSchema = z.object({
  displayName: z.string().trim().min(1, "請輸入顯示名稱"),
  role: z.enum(userRoles),
});

const apiSchema = z.object({
  account: z.string().trim().min(1, "請輸入帳號").max(200, "帳號過長"),
  password: z.string().min(1, "請輸入密碼").max(256, "密碼過長"),
});

type PreviewValues = z.infer<typeof previewSchema>;
type ApiValues = z.infer<typeof apiSchema>;

function errorMessage(error: unknown) {
  if (error instanceof ApiError) return error.message;
  return "登入失敗，請稍後再試。";
}

function PreviewLoginForm({ onSuccess }: { onSuccess(): void }) {
  const { signIn } = useAuth();
  const [submitError, setSubmitError] = useState("");
  const form = useForm<PreviewValues>({
    resolver: zodResolver(previewSchema),
    defaultValues: { displayName: "維修同仁", role: "technician" },
  });

  return (
    <form
      onSubmit={form.handleSubmit(async (values) => {
        setSubmitError("");
        try {
          await signIn(values);
          onSuccess();
        } catch (error) {
          setSubmitError(errorMessage(error));
        }
      })}
    >
      <label>
        顯示名稱
        <input {...form.register("displayName")} autoComplete="name" />
        {form.formState.errors.displayName ? <small>{form.formState.errors.displayName.message}</small> : null}
      </label>
      <label>
        預覽角色
        <select {...form.register("role")}>
          {userRoles.map((role) => <option key={role} value={role}>{roleLabels[role]}</option>)}
        </select>
      </label>
      {submitError ? <p className="auth-error" role="alert">{submitError}</p> : null}
      <button className="primary-button" type="submit" disabled={form.formState.isSubmitting}>
        <LogIn size={17} />進入預覽
      </button>
    </form>
  );
}

function ApiLoginForm({ onSuccess }: { onSuccess(): void }) {
  const { signIn } = useAuth();
  const [submitError, setSubmitError] = useState("");
  const form = useForm<ApiValues>({
    resolver: zodResolver(apiSchema),
    defaultValues: { account: "", password: "" },
  });

  return (
    <form
      onSubmit={form.handleSubmit(async (values) => {
        setSubmitError("");
        try {
          await signIn(values);
          onSuccess();
        } catch (error) {
          setSubmitError(errorMessage(error));
        }
      })}
    >
      <label>
        帳號
        <input {...form.register("account")} autoComplete="username" inputMode="email" />
        {form.formState.errors.account ? <small>{form.formState.errors.account.message}</small> : null}
      </label>
      <label>
        密碼
        <input {...form.register("password")} type="password" autoComplete="current-password" />
        {form.formState.errors.password ? <small>{form.formState.errors.password.message}</small> : null}
      </label>
      {submitError ? <p className="auth-error" role="alert">{submitError}</p> : null}
      <button className="primary-button" type="submit" disabled={form.formState.isSubmitting}>
        <KeyRound size={17} />登入系統
      </button>
    </form>
  );
}

export function LoginPage() {
  const { session } = useAuth();
  const navigate = useNavigate();
  const location = useLocation();

  if (session) return <Navigate to="/" replace />;

  const from =
    location.state && typeof location.state === "object" && "from" in location.state
      ? String(location.state.from)
      : "/";
  const isApiMode = authMode === "api";

  return (
    <main className="auth-page">
      <section className="auth-panel">
        <span className="brand-mark"><TrainFront size={22} /></span>
        <p className="page-kicker">輕軌維修系統</p>
        <h1>{isApiMode ? "帳號登入" : "預覽登入"}</h1>
        <p>{isApiMode ? "請使用核准帳號登入；角色與權限由人員主檔決定。" : "靜態預覽模式可切換角色，不會建立正式 Session。"}</p>
        {isApiMode
          ? <ApiLoginForm onSuccess={() => navigate(from, { replace: true })} />
          : <PreviewLoginForm onSuccess={() => navigate(from, { replace: true })} />}
      </section>
    </main>
  );
}
