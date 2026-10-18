import ActivityTracker from "../activity-tracker";
import { requirePageUser } from "@/lib/page-auth";
export default async function ActivityPage() {
  const user = await requirePageUser();
  return (
    <div className="legacy-surface">
      <ActivityTracker user={user} />
    </div>
  );
}
