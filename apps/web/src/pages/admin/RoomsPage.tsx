import { DAY_NAMES, ROOM_TYPES, roomBody, timeSlotBody } from '@shikshya/shared';
import { Clock, DoorOpen } from 'lucide-react';
import { useState } from 'react';
import { PageHeader } from '@/components/PageHeader';
import { ResourceManager } from '@/components/ResourceManager';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';

interface Room {
  id: string;
  name: string;
  capacity: number;
  type: (typeof ROOM_TYPES)[number];
}

interface TimeSlot {
  id: string;
  dayOfWeek: number;
  startTime: string;
  endTime: string;
  label: string | null;
}

const TABS = ['Rooms', 'Time slots'] as const;

export function RoomsPage() {
  const [tab, setTab] = useState<(typeof TABS)[number]>('Rooms');
  return (
    <>
      <PageHeader title="Rooms & Time Slots" description="The building blocks of the timetable." />
      <div role="tablist" aria-label="Rooms and time slots" className="mb-4 flex gap-2">
        {TABS.map((name) => (
          <Button
            key={name}
            role="tab"
            aria-selected={tab === name}
            variant={tab === name ? 'default' : 'outline'}
            size="sm"
            onClick={() => setTab(name)}
          >
            {name}
          </Button>
        ))}
      </div>
      {tab === 'Rooms' ? (
        <ResourceManager<Room>
          path="/rooms"
          noun="room"
          icon={DoorOpen}
          rowKey={(row) => row.id}
          rowLabel={(row) => row.name}
          columns={[
            { header: 'Name', cell: (row) => row.name },
            { header: 'Capacity', cell: (row) => row.capacity },
            {
              header: 'Type',
              cell: (row) => (
                <Badge variant={row.type === 'LAB' ? 'warning' : 'default'}>{row.type}</Badge>
              ),
            },
          ]}
          fields={[
            { name: 'name', label: 'Name', placeholder: 'Room 301' },
            { name: 'capacity', label: 'Capacity', type: 'number' },
            {
              name: 'type',
              label: 'Type',
              type: 'select',
              options: ROOM_TYPES.map((type) => ({ value: type, label: type })),
            },
          ]}
          createSchema={roomBody}
          emptyValues={{ name: '', capacity: 40, type: 'CLASSROOM' }}
          toFormValues={(row) => ({ name: row.name, capacity: row.capacity, type: row.type })}
        />
      ) : (
        <ResourceManager<TimeSlot>
          path="/time-slots"
          noun="time slot"
          icon={Clock}
          rowKey={(row) => row.id}
          rowLabel={(row) => `${DAY_NAMES[row.dayOfWeek]} ${row.startTime}`}
          columns={[
            { header: 'Day', cell: (row) => DAY_NAMES[row.dayOfWeek] },
            { header: 'Starts', cell: (row) => row.startTime },
            { header: 'Ends', cell: (row) => row.endTime },
            { header: 'Label', cell: (row) => row.label ?? '–' },
          ]}
          fields={[
            {
              name: 'dayOfWeek',
              label: 'Day',
              type: 'select',
              options: DAY_NAMES.map((name, index) => ({ value: String(index), label: name })),
            },
            { name: 'startTime', label: 'Start time', placeholder: '07:00' },
            { name: 'endTime', label: 'End time', placeholder: '07:50' },
            { name: 'label', label: 'Label (optional)', placeholder: 'Period 1' },
          ]}
          createSchema={timeSlotBody}
          emptyValues={{ dayOfWeek: '0', startTime: '', endTime: '', label: '' }}
          toFormValues={(row) => ({
            dayOfWeek: String(row.dayOfWeek),
            startTime: row.startTime,
            endTime: row.endTime,
            label: row.label ?? '',
          })}
        />
      )}
    </>
  );
}
