/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

import React, { useState } from 'react';
import { Exam, Room, Language } from '../types';
import { translations } from '../translations';
import { getPeriodFromTime } from '../utils/scheduler';
import {   Home, 
  Check, 
  AlertTriangle, 
  Calendar, 
  Clock, 
  HelpCircle,
  Hash,
  Layers,
  Sparkles,
  Bookmark
} from 'lucide-react';

interface ExamRoomManagerProps {
  lang: Language;
  exams: Exam[];
  rooms: Room[];
  onUpdateExam: (exam: Exam) => void;
}

export default function ExamRoomManager({
  lang,
  exams,
  rooms,
  onUpdateExam
}: ExamRoomManagerProps) {
  const t = translations[lang];

  // Active / Selected Exam for Association
  const [selectedExamId, setSelectedExamId] = useState<string>(exams[0]?.id || '');
  const [saveSuccess, setSaveSuccess] = useState(false);

  // Fallback if there are no exams or rooms
  if (exams.length === 0) {
    return (
      <div className="bg-white border border-slate-200 rounded-2xl p-12 text-center shadow-sm">
        <div className="mx-auto w-12 h-12 bg-amber-50 rounded-full flex items-center justify-center mb-4">
          <AlertTriangle className="h-6 w-6 text-amber-500" />
        </div>
        <p className="text-sm font-semibold text-slate-700 mb-2">
          {lang === 'pt' ? 'Sem Exames Registados' : 'No Exams Registered'}
        </p>
        <p className="text-xs text-slate-500 max-w-sm mx-auto">
          {t.examsListEmptyError}
        </p>
      </div>
    );
  }

  if (rooms.length === 0) {
    return (
      <div className="bg-white border border-slate-200 rounded-2xl p-12 text-center shadow-sm">
        <div className="mx-auto w-12 h-12 bg-amber-50 rounded-full flex items-center justify-center mb-4">
          <AlertTriangle className="h-6 w-6 text-amber-500" />
        </div>
        <p className="text-sm font-semibold text-slate-700 mb-2">
          {lang === 'pt' ? 'Sem Salas Registadas' : 'No Rooms Registered'}
        </p>
        <p className="text-xs text-slate-500 max-w-sm mx-auto">
          {t.roomsListEmptyError}
        </p>
      </div>
    );
  }

  // Active Exam
  const currentExam = exams.find(e => e.id === selectedExamId) || exams[0];

  // Room Association Status Helper
  // Returns conflicting exam if there is an overlapping reservation
  const getRoomConflict = (room: Room, examToCheck: Exam): Exam | null => {
    // Find if another exam on the same day/session has this room assigned
    const conflicting = exams.find(ex => {
      if (ex.id === examToCheck.id) return false;
      // Overlapping session
      if (ex.date === examToCheck.date && getPeriodFromTime(ex.time) === getPeriodFromTime(examToCheck.time)) {
        return ex.roomIds?.includes(room.id);
      }
      return false;
    });
    return conflicting || null;
  };

  const handleToggleRoom = (roomId: string) => {
    const currentRoomIds = currentExam.roomIds || [];
    let updatedRoomIds: string[] = [];

    if (currentRoomIds.includes(roomId)) {
      // Disassociate
      updatedRoomIds = currentRoomIds.filter(id => id !== roomId);
    } else {
      // Verify conflict before adding
      const room = rooms.find(r => r.id === roomId);
      if (room) {
        const conflict = getRoomConflict(room, currentExam);
        if (conflict) {
          // Let's draw an alert popup or block in modal
          alert(
            lang === 'pt'
              ? `Impossível Associar!\nA sala "${room.name}" já se encontra em uso no Exame "${conflict.name}" no mesmo dia (${conflict.date}) e hora (${conflict.time}).`
              : `Cannot Associate!\nRoom "${room.name}" is already reserved for Exam "${conflict.name}" on the same date (${conflict.date}) and time (${conflict.time}).`
          );
          return;
        }
      }
      // Associate
      updatedRoomIds = [...currentRoomIds, roomId];
    }

    const updatedExam = {
      ...currentExam,
      roomIds: updatedRoomIds
    };

    onUpdateExam(updatedExam);
    setSaveSuccess(true);
    setTimeout(() => setSaveSuccess(false), 2000);
  };

  return (
    <div className="space-y-6">
      
      {/* Header Banner */}
      <div className="bg-white border border-slate-200 rounded-2xl p-6 shadow-sm">
        <div className="flex flex-col md:flex-row md:items-center justify-between gap-4">
          <div>
            <h2 className="text-lg font-bold text-slate-900 flex items-center gap-2">
              <Home className="h-5 w-5 text-blue-600" />
              <span>{t.examRoomsTitle}</span>
            </h2>
            <p className="text-xs text-slate-500 mt-1 max-w-2xl">
              {t.examRoomsSubtitle}
            </p>
          </div>
          
          {saveSuccess && (
            <div className="bg-emerald-50 border border-emerald-200 text-emerald-850 px-3.5 py-1.5 rounded-lg text-xs font-semibold flex items-center gap-2 animate-pulse">
              <div className="w-2 h-2 bg-emerald-500 rounded-full"></div>
              <span>{lang === 'pt' ? 'Alterações persistidas na nuvem!' : 'Changes synced successfully!'}</span>
            </div>
          )}
        </div>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-12 gap-6 items-start">
        
        {/* Left Column: Interactive Exam Selector */}
        <div className="lg:col-span-4 bg-white border border-slate-200 rounded-2xl p-5 space-y-4 shadow-sm">
          <label className="block text-[11px] font-bold text-slate-500 uppercase tracking-wider">
            {t.selectExamToAssociate}
          </label>
          
          <div className="space-y-2.5 max-h-[400px] overflow-y-auto pr-1">
            {exams.map(ex => {
              const numRoomsAssoc = ex.roomIds?.length || 0;
              const isSelected = ex.id === currentExam.id;

              return (
                <button
                  key={ex.id}
                  onClick={() => setSelectedExamId(ex.id)}
                  className={`w-full text-left p-3.5 rounded-xl border transition flex flex-col gap-2 cursor-pointer ${
                    isSelected
                      ? 'bg-blue-50/75 border-blue-600 shadow-sm'
                      : 'bg-white border-slate-150 hover:bg-slate-50'
                  }`}
                >
                  <div className="flex justify-between items-start gap-2">
                    <span className={`text-xs font-bold ${
                      isSelected ? 'text-blue-900' : 'text-slate-800'
                    }`}>
                      {ex.name}
                    </span>
                    <span className={`text-[10px] font-semibold px-2 py-0.5 rounded-full ${
                      numRoomsAssoc > 0 
                        ? 'bg-blue-100 text-blue-800' 
                        : 'bg-slate-100 text-slate-500'
                    }`}>
                      {numRoomsAssoc} {numRoomsAssoc === 1 ? (lang === 'pt' ? 'sala' : 'room') : (lang === 'pt' ? 'salas' : 'rooms')}
                    </span>
                  </div>

                  <div className="flex flex-wrap gap-x-3 gap-y-1 text-[10px] text-slate-500">
                    <span className="flex items-center gap-1">
                      <Calendar className="h-3 w-3 text-slate-400" />
                      {ex.date}
                    </span>
                    <span className="flex items-center gap-1">
                      <Clock className="h-3 w-3 text-slate-400" />
                      {getPeriodFromTime(ex.time) === '09:00' ? (lang === 'pt' ? `Manhã (${ex.time})` : `Morning (${ex.time})`) : (lang === 'pt' ? `Tarde (${ex.time})` : `Afternoon (${ex.time})`)}
                    </span>
                  </div>

                  <div className="text-[10px] text-slate-400 border-t border-slate-100 pt-1.5 mt-0.5">
                    {lang === 'pt' ? 'Grupo Disciplinar' : 'Subject Group'}: <span className="font-semibold text-slate-600">{ex.subject_group}</span>
                  </div>
                </button>
              );
            })}
          </div>
        </div>

        {/* Right Column: Physical Rooms Check-list and Overlap Safeguards */}
        <div className="lg:col-span-8 space-y-4">
          
          {/* Detail card of selected Exam */}
          <div className="bg-slate-900 text-white rounded-2xl p-5 shadow-sm border border-slate-850 flex flex-col sm:flex-row justify-between items-start sm:items-center gap-4">
            <div>
              <div className="flex items-center gap-2 mb-1.5">
                <span className="text-[9px] font-bold uppercase tracking-widest bg-blue-600/35 border border-blue-500/25 text-blue-300 px-2 py-0.5 rounded">
                  {lang === 'pt' ? 'Exame Ativo' : 'Selected Exam'}
                </span>
                <span className="text-[10px] text-slate-400 font-medium">
                  ID: {currentExam.id}
                </span>
              </div>
              <h3 className="text-sm font-extrabold tracking-wide">
                {currentExam.name}
              </h3>
              <p className="text-[11px] text-slate-400 mt-1 flex flex-wrap items-center gap-3">
                <span>{lang === 'pt' ? 'Grupo Disciplinar' : 'Subject Group'}: <strong className="text-white">{currentExam.subject_group}</strong></span>
                <span>•</span>
                <span>{lang === 'pt' ? 'Data' : 'Date'}: <strong className="text-white">{currentExam.date}</strong></span>
                <span>•</span>
                <span>{lang === 'pt' ? 'Hora' : 'Time'}: <strong className="text-white">{currentExam.time}</strong></span>
              </p>
            </div>
            
            <div className="bg-slate-800/80 rounded-xl px-4 py-2 border border-slate-700/40 text-center self-stretch sm:self-auto flex flex-col justify-center">
              <span className="text-[9px] text-slate-400 uppercase tracking-widest font-bold">
                {lang === 'pt' ? 'Salas Definidas' : 'Allocated Rooms'}
              </span>
              <span className="text-lg font-black text-blue-400 mt-0.5">
                {currentExam.roomIds?.length || 0}
              </span>
            </div>
          </div>

          <div className="bg-white border border-slate-200 rounded-2xl p-6 shadow-sm space-y-4">
            <h4 className="text-xs font-bold text-slate-800 uppercase tracking-wider font-sans">
              {t.roomsAvailableForAssociation}
            </h4>

            {/* List of Rooms */}
            <div className="grid grid-cols-1 md:grid-cols-2 gap-3.5">
              {rooms.map(room => {
                const isAssoc = currentExam.roomIds?.includes(room.id);
                const conflict = getRoomConflict(room, currentExam);

                return (
                  <div
                    key={room.id}
                    onClick={() => {
                      if (!conflict) {
                        handleToggleRoom(room.id);
                      } else {
                        // Let's still call to trigger the alert/safeguard
                        handleToggleRoom(room.id);
                      }
                    }}
                    className={`p-4 rounded-xl border transition flex flex-col justify-between gap-3 cursor-pointer select-none relative overflow-hidden ${
                      isAssoc 
                        ? 'border-emerald-600 bg-emerald-50/35 relative' 
                        : conflict
                          ? 'border-rose-250 bg-rose-50/20 opacity-60 cursor-not-allowed'
                          : 'border-slate-150 bg-white hover:bg-slate-50'
                    }`}
                  >
                    {/* Ribbon or corner item */}
                    {isAssoc && (
                      <div className="absolute top-0 right-0 w-8 h-8 bg-emerald-500/10 flex items-center justify-center rounded-bl-xl text-emerald-600">
                        <Check className="h-4 w-4" />
                      </div>
                    )}

                    <div>
                      <div className="flex items-center gap-2">
                        <span className="p-1 rounded bg-slate-105 text-slate-500 bg-slate-100">
                          <Home className="h-3.5 w-3.5 text-slate-600" />
                        </span>
                        <span className="text-xs font-bold text-slate-800">
                          {room.name}
                        </span>
                      </div>

                      <div className="mt-3 flex items-center gap-1 text-[10px] text-slate-500 font-medium">
                        <Hash className="h-3 w-3 text-slate-400" />
                        <span>Capacidade: <strong>{room.capacity}</strong> pax</span>
                      </div>
                    </div>

                    <div className="border-t border-slate-100 pt-2.5 mt-1 flex justify-between items-center">
                      {isAssoc ? (
                        <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded text-[9px] font-bold bg-emerald-100 text-emerald-800 uppercase tracking-wide">
                          <Check className="h-2.5 w-2.5" />
                          {t.associatedBadge}
                        </span>
                      ) : conflict ? (
                        <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded text-[9px] font-bold bg-rose-100 text-rose-800">
                          <AlertTriangle className="h-2.5 w-2.5" />
                          {lang === 'pt' ? 'Ocupada / Conflito' : 'Occupied / Conflict'}
                        </span>
                      ) : (
                        <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded text-[9px] font-bold bg-slate-100 text-slate-600 uppercase tracking-wide">
                          {t.idleBadge}
                        </span>
                      )}

                      {conflict && (
                        <div className="text-[9px] text-rose-650 max-w-[150px] truncate leading-none text-rose-700 italic">
                          ({conflict.name})
                        </div>
                      )}
                    </div>
                  </div>
                );
              })}
            </div>
          </div>
        </div>

      </div>

    </div>
  );
}
