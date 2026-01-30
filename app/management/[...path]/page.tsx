import { redirect } from "next/navigation";
export default function Page({ params }: { params: { path: string[] } }) {
  redirect("/app/management/" + (params.path?.join("/") || ""));
}
