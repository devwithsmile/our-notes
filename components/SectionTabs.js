"use client";
import {
  ClipboardList,
  Music2,
  Link2,
  ListMusic,
  LockKeyhole,
} from "lucide-react";

// Add future sections here so they share the same navigation and keyboard behavior.
export const sections = [
  {
    id: "tasks",
    label: "To-do list",
    icon: ClipboardList,
    title: "Our to-do list",
    description: "One shared list. Let’s get things done together.",
  },
  {
    id: "sangeet",
    label: "Sangeet",
    icon: Music2,
    title: "Our sangeet",
    description:
      "Our favourite people. Their favourite songs. One unforgettable night.",
  },
  {
    id: "links",
    label: "Links",
    icon: Link2,
    title: "Our saved links",
    description: "Little finds for every celebration, saved together.",
  },
  {
    id: "songs",
    label: "Song list",
    icon: ListMusic,
    title: "Our song list",
    description:
      "Hindi, Marathi, and Bhojpuri favourites for the celebrations.",
  },
  {
    id: "guests",
    label: "Guest list",
    icon: LockKeyhole,
    title: "Our guest list",
    description: "The people who’ll make our day special.",
    private: true,
  },
];

export default function SectionTabs({ active, onChange, writable }) {
  const available = sections.filter((section) => !section.private || writable);
  function navigate(event, index) {
    let next;
    if (event.key === "ArrowRight") next = (index + 1) % available.length;
    if (event.key === "ArrowLeft")
      next = (index + available.length - 1) % available.length;
    if (event.key === "Home") next = 0;
    if (event.key === "End") next = available.length - 1;
    if (next === undefined) return;
    event.preventDefault();
    onChange(available[next].id);
    document.getElementById(`tab-${available[next].id}`)?.focus();
  }
  return (
    <div className="section-tabs" role="tablist" aria-label="Wedding sections">
      {available.map(({ id, label, icon: Icon }, index) => (
        <button
          key={id}
          id={`tab-${id}`}
          type="button"
          role="tab"
          aria-selected={active === id}
          aria-controls={`panel-${id}`}
          tabIndex={active === id ? 0 : -1}
          onClick={() => onChange(id)}
          onKeyDown={(event) => navigate(event, index)}
        >
          <Icon size={18} aria-hidden="true" />
          {label}
        </button>
      ))}
    </div>
  );
}
