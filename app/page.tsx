import { redirect } from "next/navigation";

// The borough is the app. (The early dashboard lives in git history.)
export default function Home() {
  redirect("/valley");
}
