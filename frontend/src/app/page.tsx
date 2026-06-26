// 首页重定向到工作台

import { redirect } from "next/navigation";

export default function Home() {
  redirect("/dashboard");
}
