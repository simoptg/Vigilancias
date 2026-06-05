/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

import { Teacher, Room, Exam, Allocation } from "../types";

export interface AllocationResult {
  allocations: Allocation[];
  notifications: Array<{
    teacherId: string;
    message: string;
  }>;
  warnings: string[];
}

/**
 * Checks if a teacher has a subject conflict with the exam.
 * Portuguese guidelines generally avoid having teachers invigilate exams of their own specialty.
 */
export function hasSubjectConflict(teacher: Teacher, exam: Exam): boolean {
  return teacher.subject.toLowerCase().trim() === exam.subject.toLowerCase().trim();
}

/**
 * Resolves a period ("09:00" or "14:00") from any custom hour string (e.g., "09:30" => "09:00").
 */
export function getPeriodFromTime(time: string): "09:00" | "14:00" {
  if (!time) return "09:00";
  if (time === "09:00" || time === "14:00") return time;
  
  const parts = time.split(':');
  if (parts.length > 0) {
    const hour = parseInt(parts[0], 10);
    if (!isNaN(hour)) {
      return hour < 12 ? "09:00" : "14:00";
    }
  }
  
  const lower = time.toLowerCase();
  if (lower.includes('tarde') || lower.includes('afternoon') || lower.includes('pm')) {
    return "14:00";
  }
  return "09:00";
}

/**
 * Checks if a teacher has registered a personal unavailability for a specific date and time.
 */
export function isTeacherUnavailableAt(teacher: Teacher, date: string, time: string): boolean {
  if (!teacher.unavailabilities) return false;
  const period = getPeriodFromTime(time);
  return teacher.unavailabilities.some(un => 
    un.date === date && (un.time === "all" || un.time === period)
  );
}

/**
 * Runs the auto-distribution of teachers for a set of rooms on a specific exam.
 * Attempts to fill Invigilator 1, Invigilator 2, and Substitute for each room.
 */
export function autoAllocate(
  exam: Exam,
  rooms: Room[],
  teachers: Teacher[],
  allAllocations: Allocation[], // Existing allocations across ALL exams (to prevent double bookings)
  currentExamAllocations: Allocation[] // Allocations just for this exam
): AllocationResult {
  const resultAllocations: Allocation[] = [...currentExamAllocations];
  const logsArr: Array<{ teacherId: string; message: string }> = [];
  const warnings: string[] = [];

  // Determine which teachers are already busy at this exam's date & time in other exams
  const busyTeacherIdsAtSession = new Set<string>();
  
  // Track assigned teachers during this allocation batch
  const assignedInThisBatch = new Set<string>();

  // Collect manual or pre-existing allocations for this exam session to avoid double assignments
  currentExamAllocations.forEach(alloc => {
    if (alloc.invigilator1Id) assignedInThisBatch.add(alloc.invigilator1Id);
    if (alloc.invigilator2Id) assignedInThisBatch.add(alloc.invigilator2Id);
    if (alloc.substituteId) assignedInThisBatch.add(alloc.substituteId);
  });

  // Filter available teachers (overall flag + specific date/time unavailability)
  const pool = teachers.filter(t => t.available && !isTeacherUnavailableAt(t, exam.date, exam.time));

  // 1. Group rooms to assign. For each room, allocate Invigilator 1 and Invigilator 2 (substitutes are now general)
  rooms.forEach(room => {
    // Check if there is already an allocation object for this room in this exam
    let alloc = resultAllocations.find(a => a.roomId === room.id && a.examId === exam.id);
    if (!alloc) {
      alloc = {
        id: `${exam.id}_${room.id}`,
        examId: exam.id,
        roomId: room.id,
        invigilator1Id: null,
        invigilator2Id: null,
        substituteId: null
      };
      resultAllocations.push(alloc);
    } else {
      // Clear substituteId on room level
      alloc.substituteId = null;
    }

    const positions: Array<'invigilator1Id' | 'invigilator2Id'> = [
      'invigilator1Id',
      'invigilator2Id'
    ];

    positions.forEach(pos => {
      if (alloc && !alloc[pos]) {
        // Find best candidate in pool:
        // Criteria 1: Not assigned in this batch
        // Criteria 2: Prefer NO subject conflict with this exam
        let candidate = pool.find(t => 
          !assignedInThisBatch.has(t.id) && 
          !hasSubjectConflict(t, exam)
        );

        // If no candidate without subject conflict exists, use an available teacher anyway but trigger a warning
        if (!candidate) {
          candidate = pool.find(t => !assignedInThisBatch.has(t.id));
          if (candidate) {
            warnings.push(
              `Atenção: O docente ${candidate.name} foi alocado ao exame de ${exam.name} na ${room.name} apesar de pertencer à disciplina de ${exam.subject} devido à falta de docentes.`
            );
          }
        }

        if (candidate) {
          alloc[pos] = candidate.id;
          assignedInThisBatch.add(candidate.id);
          logsArr.push({
            teacherId: candidate.id,
            message: `Alocado como ${
              pos === 'invigilator1Id' ? 'Vigilante 1' : 'Vigilante 2'
            } na ${room.name} para o exame de ${exam.name}.`
          });
        }
      } else if (alloc && alloc[pos]) {
        assignedInThisBatch.add(alloc[pos]!);
      }
    });
  });

  // 2. Now let's allocate a General Substitute (Suplente de Reserva) per room
  rooms.forEach(room => {
    const alloc = resultAllocations.find(a => a.roomId === room.id && a.examId === exam.id);
    if (alloc) {
      if (!alloc.substituteId) {
        // Find candidate for substitute
        // Criteria: Not already assigned in this batch, and prefer NO subject conflict
        let candidate = pool.find(t => 
          !assignedInThisBatch.has(t.id) && 
          !hasSubjectConflict(t, exam)
        );

        if (!candidate) {
          candidate = pool.find(t => !assignedInThisBatch.has(t.id));
        }

        if (candidate) {
          alloc.substituteId = candidate.id;
          assignedInThisBatch.add(candidate.id);
          logsArr.push({
            teacherId: candidate.id,
            message: `Convocado(a) como Professor(a) Suplente Geral de Apoio para o exame de ${exam.name}.`
          });
        }
      } else {
        // Secure existing assignment
        assignedInThisBatch.add(alloc.substituteId);
      }
    }
  });

  return {
    allocations: resultAllocations,
    notifications: logsArr,
    warnings
  };
}
