/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

import React, { useState, useMemo } from 'react';
import { Language, Teacher, Exam, Room, Allocation, TeacherRole } from '../types';
import { Mail, Send, Clock, CheckCircle, AlertCircle, RotateCcw } from 'lucide-react';
import { api } from '../utils/api';

interface NotificationSenderProps {
  lang: Language;
  teachers: Teacher[];
  exams: Exam[];
  rooms: Room[];
  allocations: Allocation[];
  availableRoles: TeacherRole[];
}

interface TeacherAllocationItem {
  examName: string;
  examDate: string;
  examTime: string;
  roomName: string;
  role: string;
}

interface TeacherNotification {
  teacherId: string;
  teacherName: string;
  teacherEmail: string;
  allocations: TeacherAllocationItem[];
}

export default function NotificationSender({
  lang,
  teachers,
  exams,
  rooms,
  allocations,
  availableRoles
}: NotificationSenderProps) {
  const [isSending, setIsSending] = useState(false);
  const [sentCount, setSentCount] = useState(0);
  const [failedCount, setFailedCount] = useState(0);
  const [skippedCount, setSkippedCount] = useState(0);
  const [lastError, setLastError] = useState('');
  const [logs, setLogs] = useState<{ time: string; message: string; type: 'info' | 'success' | 'error' }[]>([]);
  const [currentIndex, setCurrentIndex] = useState(0);
  const [totalToSend, setTotalToSend] = useState(0);
  const [lastFailedNotifications, setLastFailedNotifications] = useState<TeacherNotification[]>([]);
  const [mode, setMode] = useState<'all' | 'future' | 'single'>('all');
  const [selectedDate, setSelectedDate] = useState<string>('');
  
  // Helper to get today's date as YYYY-MM-DD
  const getToday = () => {
    const today = new Date();
    const yyyy = today.getFullYear();
    const mm = String(today.getMonth() + 1).padStart(2, '0');
    const dd = String(today.getDate()).padStart(2, '0');
    return `${yyyy}-${mm}-${dd}`;
  };

  const addLog = (message: string, type: 'info' | 'success' | 'error' = 'info') => {
    const time = new Date().toLocaleTimeString();
    setLogs(prev => [...prev, { time, message, type }]);
  };

  // Helper function to get role name
  const getRoleName = (roleId: string | null | undefined) => {
    if (!roleId) return '';
    const role = availableRoles.find(r => r.id === roleId);
    return role ? role.name : roleId;
  };

  const getTeacherAllocations = (filterDate: string | null = null) => {
    const today = getToday();
    return teachers.map(teacher => {
      const myAllocations = allocations.filter(a => {
        if (a.invigilator1Id !== teacher.id && 
            a.invigilator2Id !== teacher.id && 
            a.substituteId !== teacher.id) {
          return false;
        }
        const exam = exams.find(e => e.id === a.examId);
        if (!exam) return false;
        if (filterDate !== null && exam.date !== filterDate) return false;
        if (mode === 'future' && exam.date < today) return false;
        return true;
      });

      const mappedAllocs = myAllocations.map(a => {
        const exam = exams.find(e => e.id === a.examId);
        const room = rooms.find(r => r.id === a.roomId);
        let role = '';
        const isSubstitute = a.substituteId === teacher.id;
        
        if (a.invigilator1Id === teacher.id) role = lang === 'pt' ? 'Vigilante 1' : 'Invigilator 1';
        else if (a.invigilator2Id === teacher.id) role = lang === 'pt' ? 'Vigilante 2' : 'Invigilator 2';
        else if (isSubstitute) role = lang === 'pt' ? 'Suplente' : 'Substitute';

        if (!exam || !room) return null;

        return {
          examName: isSubstitute ? '' : exam.name,
          examDate: exam.date,
          examTime: exam.time,
          roomName: isSubstitute ? '' : room.name,
          role
        };
      }).filter(Boolean) as TeacherAllocationItem[];

      return {
        teacherId: teacher.id,
        teacherName: teacher.name,
        teacherEmail: teacher.email || '',
        allocations: mappedAllocs,
        hasAllocations: mappedAllocs.length > 0
      };
    }).filter(item => item.hasAllocations);
  };

  // Get unique dates from exams
  const uniqueDates = useMemo(() => {
    const datesSet = new Set<string>();
    const today = getToday();
    exams.forEach(exam => {
      if (mode === 'future' && exam.date < today) return;
      datesSet.add(exam.date);
    });
    return Array.from(datesSet).sort();
  }, [exams, mode]);

  const teacherAllocations = useMemo(() => {
    const filterDate = mode === 'single' && selectedDate ? selectedDate : null;
    return getTeacherAllocations(filterDate);
  }, [teachers, exams, rooms, allocations, mode, selectedDate]);

  const handleSendEmails = async (notificationsToSend: TeacherNotification[] = teacherAllocations) => {
    if (notificationsToSend.length === 0) {
      alert(lang === 'pt' ? 'Nenhuma notificação para enviar.' : 'No notifications to send.');
      return;
    }
    
    const isSingle = notificationsToSend.length === 1;
    if (!confirm(isSingle
      ? (lang === 'pt' ? `Deseja enviar notificação para ${notificationsToSend[0].teacherName}?` : `Do you want to send notification to ${notificationsToSend[0].teacherName}?`)
      : (lang === 'pt' ? `Deseja enviar ${notificationsToSend.length} notificação(ões) por email?` : `Do you want to send ${notificationsToSend.length} email notification(s)?`))) {
      return;
    }

    setIsSending(true);
    setLastError('');
    setSentCount(0);
    setFailedCount(0);
    setSkippedCount(0);
    setLogs([]);
    setCurrentIndex(0);
    setTotalToSend(notificationsToSend.length);
    
    // Create a copy to track failures
    const newFailedNotifications: TeacherNotification[] = [];
    
    try {
      for (let i = 0; i < notificationsToSend.length; i++) {
        const notification = notificationsToSend[i];
        
        if (!notification.teacherEmail?.trim()) {
          addLog(`Skipped ${notification.teacherName} - no email`, 'info');
          setSkippedCount(prev => prev + 1);
          continue;
        }
        
        addLog(`Sending to ${notification.teacherName} (${notification.teacherEmail})...`, 'info');
        setCurrentIndex(i + 1);
        
        const result = await api.sendNotifications([notification]);
        
        if (result.results?.[0]?.success) {
          addLog(`✓ Sent to ${notification.teacherName}`, 'success');
          setSentCount(prev => prev + 1);
        } else {
          const errorMsg = result.results?.[0]?.error || (lang === 'pt' ? 'Erro desconhecido' : 'Unknown error');
          addLog(`✗ Failed to send to ${notification.teacherName}: ${errorMsg}`, 'error');
          setFailedCount(prev => prev + 1);
          newFailedNotifications.push(notification);
        }
        
        // Small delay to allow UI to update
        await new Promise(resolve => setTimeout(resolve, 100));
      }
      
      setLastFailedNotifications(newFailedNotifications);
      
      if (newFailedNotifications.length > 0) {
        alert(lang === 'pt'
          ? `Enviados: ${sentCount} | Falhados: ${failedCount} | Pulados: ${skippedCount}`
          : `Sent: ${sentCount} | Failed: ${failedCount} | Skipped: ${skippedCount}`);
      } else {
        alert(lang === 'pt'
          ? 'Todas as notificações enviadas com sucesso!'
          : 'All notifications sent successfully!');
      }
    } catch (err) {
      const message = err instanceof Error ? err.message : (lang === 'pt' ? 'Erro ao enviar notificações.' : 'Error sending notifications.');
      setLastError(message);
      addLog(`Error: ${message}`, 'error');
    } finally {
      setIsSending(false);
    }
  };

  return (
    <div className="space-y-6">
      <div className="bg-slate-900 text-white rounded-2xl p-6 shadow-sm flex flex-col md:flex-row justify-between items-start gap-4">
        <div className="flex-1">
          <h2 className="text-xl font-bold tracking-tight mb-1">
            {lang === 'pt' ? 'Enviar Notificações por Email' : 'Send Email Notifications'}
          </h2>
          <p className="text-slate-400 text-xs">
            {lang === 'pt'
              ? 'Envia avisos de vigilância aos docentes via Resend.'
              : 'Send invigilation notices to teachers via Resend.'}
          </p>
        </div>
        <div className="flex flex-wrap gap-2">
          {lastFailedNotifications.length > 0 && (
            <button
              onClick={() => handleSendEmails(lastFailedNotifications)}
              disabled={isSending}
              className="flex items-center space-x-2 bg-amber-600 hover:bg-amber-500 text-white text-xs font-semibold px-4 py-2 rounded-lg transition disabled:opacity-50 cursor-pointer"
            >
              <RotateCcw className="h-4 w-4" />
              <span>{lang === 'pt' ? 'Reenviar Falhas' : 'Resend Failed'}</span>
            </button>
          )}
          <button
            onClick={() => handleSendEmails()}
            disabled={isSending || teacherAllocations.length === 0}
            className="flex items-center space-x-2 bg-blue-600 hover:bg-blue-500 text-white text-xs font-semibold px-6 py-2 rounded-lg transition disabled:opacity-50 cursor-pointer shadow-lg shadow-blue-600/20"
          >
            {isSending ? <Clock className="h-4 w-4 animate-spin" /> : <Send className="h-4 w-4" />}
            <span>{lang === 'pt' ? 'Enviar Notificações' : 'Send Notifications'}</span>
          </button>
        </div>
      </div>

      {/* Filters */}
      <div className="bg-white border border-slate-200 rounded-xl p-4 shadow-sm">
        <h3 className="text-sm font-semibold text-slate-700 mb-3">
          {lang === 'pt' ? 'Filtros' : 'Filters'}
        </h3>
        <div className="flex flex-wrap gap-4 items-center">
          <div className="flex gap-2 items-center">
            <label className="text-xs text-slate-600">
              {lang === 'pt' ? 'Modo:' : 'Mode:'}
            </label>
            <button
              onClick={() => { setMode('all'); setSelectedDate(''); }}
              className={`px-3 py-1 text-xs rounded-lg border transition ${
                mode === 'all' ? 'bg-blue-600 text-white border-blue-600' : 'bg-white text-slate-700 border-slate-300 hover:border-blue-500'
              }`}
            >
              {lang === 'pt' ? 'Todas' : 'All'}
            </button>
            <button
              onClick={() => { setMode('future'); setSelectedDate(''); }}
              className={`px-3 py-1 text-xs rounded-lg border transition ${
                mode === 'future' ? 'bg-blue-600 text-white border-blue-600' : 'bg-white text-slate-700 border-slate-300 hover:border-blue-500'
              }`}
            >
              {lang === 'pt' ? 'Futuras' : 'Future'}
            </button>
            <button
              onClick={() => setMode('single')}
              className={`px-3 py-1 text-xs rounded-lg border transition ${
                mode === 'single' ? 'bg-blue-600 text-white border-blue-600' : 'bg-white text-slate-700 border-slate-300 hover:border-blue-500'
              }`}
            >
              {lang === 'pt' ? 'Data Específica' : 'Specific Date'}
            </button>
          </div>
          
          {mode === 'single' && (
            <div className="flex gap-2 items-center">
              <label className="text-xs text-slate-600">
                {lang === 'pt' ? 'Selecione a data:' : 'Select date:'}
              </label>
              <select
                value={selectedDate}
                onChange={(e) => setSelectedDate(e.target.value)}
                className="px-3 py-1 text-xs border border-slate-300 rounded-lg bg-white"
              >
                <option value="">{lang === 'pt' ? 'Escolha uma data' : 'Choose a date'}</option>
                {uniqueDates.map(date => (
                  <option key={date} value={date}>{date}</option>
                ))}
              </select>
            </div>
          )}
          
          <div className="text-xs text-slate-500 ml-auto">
            {teacherAllocations.length} {lang === 'pt' ? 'docentes para notificar' : 'teachers to notify'}
          </div>
        </div>
      </div>

      {/* Progress bar and stats */}
      {isSending && (
        <div className="bg-white border border-slate-200 rounded-xl p-4 shadow-sm">
          <div className="flex justify-between items-center mb-2">
            <span className="text-xs font-semibold text-slate-700">
              {lang === 'pt' ? 'Progresso' : 'Progress'}: {currentIndex}/{totalToSend}
            </span>
            <div className="flex gap-3 text-xs">
              <span className="text-green-600 flex items-center gap-1">
                <CheckCircle className="h-3 w-3" /> {sentCount}
              </span>
              {failedCount > 0 && (
                <span className="text-red-600 flex items-center gap-1">
                  <AlertCircle className="h-3 w-3" /> {failedCount}
                </span>
              )}
              {skippedCount > 0 && (
                <span className="text-slate-500">
                  (skp: {skippedCount})
                </span>
              )}
            </div>
          </div>
          <div className="w-full bg-slate-200 rounded-full h-2.5 mb-4">
            <div 
              className="bg-blue-600 h-2.5 rounded-full transition-all duration-300" 
              style={{ width: `${totalToSend > 0 ? (currentIndex / totalToSend) * 100 : 0}%` }}
            ></div>
          </div>
        </div>
      )}

      {/* Logs */}
      {logs.length > 0 && (
        <div className="bg-slate-50 border border-slate-200 rounded-xl p-4 shadow-sm max-h-60 overflow-y-auto">
          <h3 className="text-xs font-semibold text-slate-700 mb-2">
            {lang === 'pt' ? 'Registo' : 'Log'}
          </h3>
          <div className="space-y-1">
            {logs.map((log, idx) => (
              <div key={idx} className="text-xs flex gap-2">
                <span className="text-slate-400 font-mono">[{log.time}]</span>
                <span className={
                  log.type === 'success' ? 'text-green-700' :
                  log.type === 'error' ? 'text-red-700' : 'text-slate-700'
                }>
                  {log.message}
                </span>
              </div>
            ))}
          </div>
        </div>
      )}

      {(sentCount > 0 || failedCount > 0) && !isSending && (
        <div className="flex gap-3">
          {sentCount > 0 && (
            <div className="flex items-center gap-2 bg-green-50 border border-green-200 text-green-700 text-xs px-4 py-2 rounded-lg">
              <CheckCircle className="h-4 w-4" />
              {sentCount} {lang === 'pt' ? 'enviados' : 'sent'}
            </div>
          )}
          {failedCount > 0 && (
            <div className="flex items-center gap-2 bg-red-50 border border-red-200 text-red-700 text-xs px-4 py-2 rounded-lg">
              <AlertCircle className="h-4 w-4" />
              {failedCount} {lang === 'pt' ? 'falhados' : 'failed'}
            </div>
          )}
          {skippedCount > 0 && (
            <div className="flex items-center gap-2 bg-slate-50 border border-slate-200 text-slate-700 text-xs px-4 py-2 rounded-lg">
              <Clock className="h-4 w-4" />
              {skippedCount} {lang === 'pt' ? 'pulados' : 'skipped'}
            </div>
          )}
        </div>
      )}

      {lastError && (
        <div className="flex items-center gap-2 bg-red-50 border border-red-200 text-red-700 text-xs px-4 py-3 rounded-lg">
          <AlertCircle className="h-4 w-4 shrink-0" />
          {lastError}
        </div>
      )}

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
            teacherAllocations.map(({ teacherId, teacherName, teacherEmail, allocations }) => (
              <div key={teacherId} className="p-5 hover:bg-slate-50/50 transition">
                <div className="flex flex-col md:flex-row md:items-center justify-between gap-4">
                  <div className="space-y-1 flex-1">
                    <h4 className="font-bold text-slate-900 text-sm">{teacherName}</h4>
                    <p className={`text-xs ${teacherEmail ? 'text-slate-500' : 'text-red-500 font-semibold'}`}>
                      {teacherEmail || (lang === 'pt' ? 'Sem email registado' : 'No email registered')}
                    </p>
                  </div>
                  <div className="flex flex-wrap gap-2 flex-1 justify-end">
                    {allocations.map((alloc, idx) => (
                      <div key={idx} className="bg-white border border-slate-200 rounded-lg px-3 py-2 text-[10px] shadow-sm">
                        {alloc.examName ? (
                          <>
                            <span className="font-bold text-blue-700 block mb-0.5">{alloc.examName}</span>
                            <span className="text-slate-600">
                              {alloc.roomName} • {alloc.role} • {alloc.examDate} {alloc.examTime}
                            </span>
                          </>
                        ) : (
                          <>
                            <span className="font-bold text-amber-700 block mb-0.5">{alloc.role}</span>
                            <span className="text-slate-600">{lang === 'pt' ? 'Dia:' : 'Date:'} {alloc.examDate} • {alloc.examTime}</span>
                          </>
                        )}
                      </div>
                    ))}
                    {teacherEmail && (
                      <button
                        onClick={() => handleSendEmails([{ teacherId, teacherName, teacherEmail, allocations }])}
                        disabled={isSending}
                        className="flex items-center gap-1 bg-green-600 hover:bg-green-500 text-white text-xs font-semibold px-3 py-2 rounded-lg transition disabled:opacity-50 cursor-pointer"
                      >
                        <Send className="h-3 w-3" />
                        {lang === 'pt' ? 'Enviar' : 'Send'}
                      </button>
                    )}
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
