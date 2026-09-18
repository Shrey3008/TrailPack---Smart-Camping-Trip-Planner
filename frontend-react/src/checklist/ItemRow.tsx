import { memo } from 'react';

import type { ChecklistItem } from './checklistReducer';
import type { Member } from './useChecklist';

interface ItemRowProps {
  item: ChecklistItem;
  members: Member[];
  viewerId: string | undefined;
  onToggle: (itemId: string) => void;
  onAssign: (itemId: string, userId: string | null) => void;
  onRemove: (itemId: string) => void;
}

export function memberLabel(member: Member, viewerId: string | undefined): string {
  // For a collaborator, nothing in the API returns the owner's name, so fall
  // back to their role rather than render an empty option.
  const base = member.name || member.email || (member.isOwner ? 'Trip owner' : 'Trip member');
  return member.userId === viewerId ? `${base} (you)` : base;
}

/**
 * One checklist row.
 *
 * Memoised because a checklist can run to a hundred rows and a single toggle
 * should re-render one of them, not all. That only works because every
 * callback passed in is stable — useChecklist builds them with useCallback over
 * refs — and `item` is a new object only for the row that changed.
 */
export const ItemRow = memo(function ItemRow({
  item,
  members,
  viewerId,
  onToggle,
  onAssign,
  onRemove,
}: ItemRowProps) {
  // A row the API has not confirmed only has a temporary id. Its controls are
  // disabled because any request made with that id would 404.
  const locked = item.isUnsaved;
  const assignee = members.find((m) => m.userId === item.assignedTo);

  const classes = ['item'];
  if (item.packed) classes.push('item--packed');
  if (item.isSaving) classes.push('item--saving');
  if (locked) classes.push('item--unsaved');

  return (
    <li className={classes.join(' ')}>
      <label className="item__check">
        <input
          type="checkbox"
          checked={item.packed}
          disabled={locked}
          onChange={() => onToggle(item.itemId)}
          // The visible name is beside the box, not inside the label, so the
          // label is given explicitly. Without it a screen reader announces
          // "checkbox, not checked" with no idea which item.
          aria-label={`Packed: ${item.name}`}
        />
        <span className="item__box" aria-hidden="true">
          <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="3.5" strokeLinecap="round" strokeLinejoin="round">
            <polyline points="4 12 10 18 20 6" />
          </svg>
        </span>
      </label>

      <span className="item__name">
        {item.name}
        {locked ? <span className="sr-only"> (saving)</span> : null}
      </span>

      {members.length > 0 ? (
        <select
          className={`item__assignee${item.assignedTo ? ' item__assignee--set' : ''}`}
          value={item.assignedTo ?? ''}
          disabled={locked}
          aria-label={`Who is carrying ${item.name}`}
          onChange={(e) => onAssign(item.itemId, e.target.value || null)}
        >
          <option value="">Unassigned</option>
          {members.map((member) => (
            <option key={member.userId} value={member.userId}>
              {memberLabel(member, viewerId)}
            </option>
          ))}
          {/* Assigned to someone who is no longer on the trip — keep the value
              selectable rather than silently showing "Unassigned", which would
              misreport who has it. */}
          {item.assignedTo && !assignee ? (
            <option value={item.assignedTo}>Former member</option>
          ) : null}
        </select>
      ) : null}

      <button
        type="button"
        className="item__remove"
        disabled={locked}
        onClick={() => onRemove(item.itemId)}
        aria-label={`Remove ${item.name}`}
      >
        <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
          <polyline points="3 6 5 6 21 6" />
          <path d="M19 6l-1 14a2 2 0 0 1-2 2H8a2 2 0 0 1-2-2L5 6" />
          <path d="M10 11v6M14 11v6" />
          <path d="M9 6V4a1 1 0 0 1 1-1h4a1 1 0 0 1 1 1v2" />
        </svg>
      </button>
    </li>
  );
});
