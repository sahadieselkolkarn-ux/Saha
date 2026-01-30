import { redirect } from "next/navigation";
export default function Page({ params }: { params: { path: string[] } }) {
  redirect("/management/" + (params.path?.join("/") || ""));
}
