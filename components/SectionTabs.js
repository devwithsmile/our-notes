"use client";
import { ClipboardList, Music2 } from "lucide-react";

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
];

export default function SectionTabs({ active, onChange }) {
  function navigate(event, index) {
    let next;
    if (event.key === "ArrowRight") next = (index + 1) % sections.length;
    if (event.key === "ArrowLeft")
      next = (index + sections.length - 1) % sections.length;
    if (event.key === "Home") next = 0;
    if (event.key === "End") next = sections.length - 1;
    if (next === undefined) return;
    event.preventDefault();
    onChange(sections[next].id);
    document.getElementById(`tab-${sections[next].id}`)?.focus();
  }
  return (
    <div className="section-tabs" role="tablist" aria-label="Wedding sections">
      {sections.map(({ id, label, icon: Icon }, index) => (
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
