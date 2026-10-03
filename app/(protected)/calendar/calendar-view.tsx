"use client";

import FullCalendar from "@fullcalendar/react";
import dayGridPlugin from "@fullcalendar/react/daygrid";
import classicThemePlugin from "@fullcalendar/react/themes/classic";
import { useRouter } from "next/navigation";
import type { EventInput } from "@fullcalendar/react";

export default function CalendarView({ entries }: { entries: EventInput[] }) {
  const router = useRouter();

  return (
    <div className="calendar-shell rounded-lg border border-zinc-800 bg-zinc-900/30 p-2 sm:p-4">
      <FullCalendar
        plugins={[classicThemePlugin, dayGridPlugin]}
        initialView="dayGridMonth"
        timeZone="America/Denver"
        colorScheme="dark"
        height="auto"
        dayMaxEvents
        events={entries}
        headerToolbar={{
          left: "prev,next today",
          center: "title",
          right: "",
        }}
        eventClick={(info) => {
          if (!info.event.url) return;
          info.jsEvent.preventDefault();
          router.push(info.event.url);
        }}
      />
    </div>
  );
}
