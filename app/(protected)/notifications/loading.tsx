import { ListSectionSkeleton } from "@/components/route-skeleton";

export default function NotificationsLoading() {
  return <ListSectionSkeleton label="Loading Notifications" rows={6} />;
}
