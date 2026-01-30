import { redirect } from "next/navigation";

export default function Page({ params }: { params: { path: string[] } }) {
  const target = "/" + (params.path?.join("/") || "");
  redirect(target);
}
