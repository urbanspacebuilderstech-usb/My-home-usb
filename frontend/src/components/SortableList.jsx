import React from 'react';
import {
  DndContext,
  closestCenter,
  KeyboardSensor,
  PointerSensor,
  useSensor,
  useSensors,
} from '@dnd-kit/core';
import {
  SortableContext,
  useSortable,
  verticalListSortingStrategy,
  arrayMove,
} from '@dnd-kit/sortable';
import { CSS } from '@dnd-kit/utilities';
import { restrictToVerticalAxis } from '@dnd-kit/modifiers';
import { GripVertical } from 'lucide-react';

// Drag handle component
export const DragHandle = ({ listeners, attributes }) => (
  <button
    {...listeners}
    {...attributes}
    className="cursor-grab active:cursor-grabbing p-1 text-gray-400 hover:text-gray-600 touch-none"
    data-testid="drag-handle"
    tabIndex={-1}
  >
    <GripVertical className="h-4 w-4" />
  </button>
);

// Sortable row wrapper for tables
export const SortableTableRow = ({ id, children, className = '' }) => {
  const {
    attributes,
    listeners,
    setNodeRef,
    transform,
    transition,
    isDragging,
  } = useSortable({ id });

  const style = {
    transform: CSS.Transform.toString(transform),
    transition,
    opacity: isDragging ? 0.5 : 1,
    zIndex: isDragging ? 10 : undefined,
    position: 'relative',
    backgroundColor: isDragging ? '#f0f4ff' : undefined,
  };

  return (
    <tr ref={setNodeRef} style={style} className={className}>
      {typeof children === 'function'
        ? children({ listeners, attributes })
        : children}
    </tr>
  );
};

// Sortable div wrapper for non-table lists
export const SortableItem = ({ id, children, className = '' }) => {
  const {
    attributes,
    listeners,
    setNodeRef,
    transform,
    transition,
    isDragging,
  } = useSortable({ id });

  const style = {
    transform: CSS.Transform.toString(transform),
    transition,
    opacity: isDragging ? 0.5 : 1,
    zIndex: isDragging ? 10 : undefined,
    position: 'relative',
    backgroundColor: isDragging ? '#f0f4ff' : undefined,
  };

  return (
    <div ref={setNodeRef} style={style} className={className}>
      {typeof children === 'function'
        ? children({ listeners, attributes })
        : children}
    </div>
  );
};

// Main sortable list wrapper
export const SortableList = ({ items, onReorder, children, modifiers }) => {
  const sensors = useSensors(
    useSensor(PointerSensor, { activationConstraint: { distance: 5 } }),
    useSensor(KeyboardSensor)
  );

  const handleDragEnd = (event) => {
    const { active, over } = event;
    if (!over || active.id === over.id) return;
    const oldIndex = items.indexOf(active.id);
    const newIndex = items.indexOf(over.id);
    if (oldIndex !== -1 && newIndex !== -1) {
      onReorder(arrayMove(items, oldIndex, newIndex), oldIndex, newIndex);
    }
  };

  return (
    <DndContext
      sensors={sensors}
      collisionDetection={closestCenter}
      onDragEnd={handleDragEnd}
      modifiers={modifiers || [restrictToVerticalAxis]}
    >
      <SortableContext items={items} strategy={verticalListSortingStrategy}>
        {children}
      </SortableContext>
    </DndContext>
  );
};

export { arrayMove };
