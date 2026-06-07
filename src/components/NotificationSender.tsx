/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

import React, { useState } from 'react';
import { Language, Teacher, Exam, Room, Allocation } from '../types';
import { translations } from '../translations';
import { Mail, Send, CheckCircle, Clock } from 'lucide-react';

interface NotificationSenderProps {
  lang: Language;
  teachers: Teacher[];
  exams: Exam[];
  rooms: Room[];
  allocations: Allocation[];
}

export default function NotificationSender({
  lang,
  teachers,
  exams,
  rooms,
  allocations
}: NotificationSenderProps) {
  const t = translations[lang];
  const [isSending, setIsSending] = useState(false);
  const [sentCount, setSentCount] = useState(0);

  // Group allocations by teacher
  const teacherAllocations = teachers.map(teacher => {
    const myAllocations = allocations.filter(a => 
      a.invigilator1Id === teacher.id || 
      a.invigilator2Id === teacher.id || 
      a.substituteId === teacher.id
    );

    return {
      teacher,
      allocations: myAllocations.map(a => {
        const exam = exams.find(e => e.id === a.examId);
        const room = rooms.find(r => r.id === a.roomId);
        let role = '';
        if (a.invigilator1Id === teacher.id) role = lang === 'pt' ? 'Vigilante 1' : 'Invigilator 1';
        else if (a.invigilator2Id === teacher.id) role = lang === 'pt' ? 'Vigilante 2' : 'Invigilator 2';
        else if (a.substituteId === teacher.id) role = lang === 'pt' ? 'Suplente' : 'Substitute';

        return { exam, room, role };
      }).filter(item => item.exam && item.room)
    };
  }).filter(item => item.allocations.length > 0);

  const handleSendEmails = async () => {
    if (!confirm(lang === 'pt' ? 'Deseja preparar o envio de notificações por email para todos os docentes com vigilâncias atribuídas?' : 'Do you want to prepare email notifications for all teachers with assigned invigilations?')) {
      return;
    }

    setIsSending(true);
    // Simulation of preparing notifications
    await new Promise(resolve => setTimeout(resolve, 2000));
    setSentCount(teacherAllocations.length);
    setIsSending(false);
    alert(lang === 'pt' ? `Notificações preparadas para ${teacherAllocations.length} docentes.` : `Notifications prepared for ${teacherAllocations.length} teachers.`);
  };

  return (
    <div className="space-y-6">
      <div className="bg-slate-900 text-white rounded-2xl p-6 shadow-sm flex flex-col md:flex-row justify-between items-center gap-4">
        <div>
          <h2 className="text-xl font-bold tracking-tight mb-1">
            {lang === 'pt' ? 'Preparar Notificações por Email' : 'Prepare Email Notifications'}
          </h2>
          <p className="text-slate-400 text-xs">
            {lang === 'pt' 
              ? 'Gere a lista de avisos de vigilância para enviar aos docentes.' 
              : 'Generate the list of invigilation notices to send to teachers.'}
          </p>
        </div>
        <button
          onClick={handleSendEmails}
          disabled={isSending || teacherAllocations.length === 0}
          className="flex items-center space-x-2 bg-blue-600 hover:bg-blue-500 text-white text-xs font-semibold px-6 py-3 rounded-lg transition disabled:opacity-50 cursor-pointer shadow-lg shadow-blue-600/20"
        >
          {isSending ? <Clock className="h-4 w-4 animate-spin" /> : <Send className="h-4 w-4" />}
          <span>{lang === 'pt' ? 'Enviar Notificações' : 'Send Notifications'}</span>
        </button>
      </div>

      <div className="bg-white border border-slate-200 rounded-2xl shadow-sm overflow-hidden">
        <div className="p-5 border-b border-slate-100 flex justify-between items-center bg-slate-50/50">
          <h3 className="font-bold text-slate-800 text-sm flex items-center gap-2">
            <Mail className="h-4 w-4 text-blue-600" />
            {lang === 'pt' ? 'Docentes a Notificar' : 'Teachers to Notify'}
          </h3>
          <span className="text-xs font-mono font-bold text-blue-700 bg-blue-50 px-2.5 py-1 rounded-full border border-blue-100">
            {teacherAllocations.length} {lang === 'pt' ? 'Docentes' : 'Teachers'}
          </span>
        </div>

        <div className="divide-y divide-slate-100">
          {teacherAllocations.length > 0 ? (
            teacherAllocations.map(({ teacher, allocations }) => (
              <div key={teacher.id} className="p-5 hover:bg-slate-50/50 transition">
                <div className="flex flex-col md:flex-row md:items-center justify-between gap-4">
                  <div className="space-y-1">
                    <h4 className="font-bold text-slate-900 text-sm">{teacher.name}</h4>
                    <p className="text-xs text-slate-500">{teacher.email}</p>
                  </div>
                  <div className="flex flex-wrap gap-2">
                    {allocations.map((alloc, idx) => (
                      <div key={idx} className="bg-white border border-slate-200 rounded-lg px-3 py-2 text-[10px] shadow-sm">
                        <span className="font-bold text-blue-700 block mb-0.5">{alloc.exam?.name}</span>
                        <span className="text-slate-600">{alloc.room?.name} • {alloc.role}</span>
                      </div>
                    ))}
                  </div>
                </div>
              </div>
            ))
          ) : (
            <div className="p-10 text-center text-slate-400 text-xs italic">
              {lang === 'pt' ? 'Nenhuma alocação detetada para notificar.' : 'No allocations detected to notify.'}
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
