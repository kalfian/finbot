import ExpenseTracker from "./expense-tracker";
import { requirePageUser } from "@/lib/page-auth";

export default async function Home() {
  const user = await requirePageUser();
  return <ExpenseTracker user={user} />;
}
