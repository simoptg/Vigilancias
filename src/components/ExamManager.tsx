/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

import React, { useState } from 'react';
import { Exam, Language, Teacher } from '../types';
import { translations } from '../translations';
import { Plus, Calendar, Clock, Trash2, Edit2, X, FileDown } from 'lucide-react';
import { getPeriodFromTime } from '../utils/scheduler';
import { jsPDF } from 'jspdf';
import autoTable from 'jspdf-autotable';

function getMonthName(monthNumber: number, lang: Language): string {
  const monthsPt = [
    'Janeiro', 'Fevereiro', 'Março', 'Abril', 'Maio', 'Junho',
    'Julho', 'Agosto', 'Setembro', 'Outubro', 'Novembro', 'Dezembro'
  ];
  const monthsEn = [
    'January', 'February', 'March', 'April', 'May', 'June',
    'July', 'August', 'September', 'October', 'November', 'December'
  ];
  return lang === 'pt' ? monthsPt[monthNumber - 1] : monthsEn[monthNumber - 1];
}

function getDayInfo(dateStr: string, lang: Language): string {
  const parts = dateStr.split('-');
  if (parts.length !== 3) return dateStr;
  const year = parseInt(parts[0], 10);
  const month = parseInt(parts[1], 10);
  const day = parseInt(parts[2], 10);
  
  // Safe local date construction without UTC offset issues
  const dateObj = new Date(year, month - 1, day);
  
  const weekdaysPt = ['Domingo', 'Segunda-feira', 'Terça-feira', 'Quarta-feira', 'Quinta-feira', 'Sexta-feira', 'Sábado'];
  const weekdaysEn = ['Sunday', 'Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday'];
  
  const weekday = lang === 'pt' ? weekdaysPt[dateObj.getDay()] : weekdaysEn[dateObj.getDay()];
  const monthName = getMonthName(month, lang);
  
  if (lang === 'pt') {
    return `${weekday}, ${day} de ${monthName}`;
  } else {
    return `${weekday}, ${monthName} ${day}`;
  }
}

interface GroupedExams {
  monthKey: string;
  monthDisplay: string;
  days: {
    dayKey: string;
    dayDisplay: string;
    periods: {
      periodKey: "09:00" | "14:00";
      periodDisplay: string;
      exams: Exam[];
    }[];
  }[];
}

interface ExamManagerProps {
  lang: Language;
  exams: Exam[];
  teachers: Teacher[];
  onAddExam: (exam: Exam) => void;
  onUpdateExam: (exam: Exam) => void;
  onDeleteExam: (id: string) => void;
}

export default function ExamManager({
  lang,
  exams,
  teachers,
  onAddExam,
  onUpdateExam,
  onDeleteExam
}: ExamManagerProps) {
  const t = translations[lang];

  const [isModalOpen, setIsModalOpen] = useState(false);
  const [editingExam, setEditingExam] = useState<Exam | null>(null);

  // Form states
  const [name, setName] = useState('');
  const [subject, setSubject] = useState('');
  const [date, setDate] = useState('2026-06-18');
  const [time, setTime] = useState("09:00");
  const [isManualSubject, setIsManualSubject] = useState(false);

  // Get unique, non-empty and sorted subjects from teachers
  const uniqueTeacherSubjects = Array.from(
    new Set(teachers.map((tchr) => tchr.subject?.trim()).filter(Boolean))
  ).sort((a, b) => a.localeCompare(b, lang));

  const handleOpenAdd = () => {
    setEditingExam(null);
    setName('');
    setSubject('');
    setDate('2026-06-18');
    setTime('09:00');
    setIsManualSubject(false);
    setIsModalOpen(true);
  };

  const handleOpenEdit = (ex: Exam) => {
    setEditingExam(ex);
    setName(ex.name);
    setSubject(ex.subject);
    setDate(ex.date);
    setTime(ex.time);

    // If the exam subject is not in the teachers list, fall back to manual input
    const subjectExistsInTeachers = uniqueTeacherSubjects.some(
      (sub) => sub.toLowerCase() === ex.subject.trim().toLowerCase()
    );
    setIsManualSubject(!subjectExistsInTeachers);

    setIsModalOpen(true);
  };

  const handleSave = (e: React.FormEvent) => {
    e.preventDefault();
    if (!name || !subject) {
      alert('Por favor, informe todos os campos obrigatórios.');
      return;
    }

    if (editingExam) {
      onUpdateExam({
        ...editingExam,
        name,
        subject,
        date,
        time
      });
    } else {
      onAddExam({
        id: `e_${Date.now()}`,
        name,
        subject,
        date,
        time
      });
    }
    setIsModalOpen(false);
  };

  const handleExportPDF = () => {
    if (exams.length === 0) return;

    // Exactly "Exames Registados" as requested by the user
    const title = 'Exames Registados';
    const subtitle = lang === 'pt' 
      ? 'Escola Secundária D. João II - Sistema de Alocações' 
      : 'Secondary School D. João II - Allocation System';
    const timestamp = lang === 'pt' 
      ? `Gerado em: ${new Date().toLocaleDateString('pt-PT')} ${new Date().toLocaleTimeString('pt-PT', { hour: '2-digit', minute: '2-digit' })}`
      : `Generated on: ${new Date().toLocaleDateString()} ${new Date().toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}`;

    const doc = new jsPDF({
      orientation: 'portrait',
      unit: 'mm',
      format: 'a4'
    });

    // Header block mimicking web layout
    doc.setFillColor(30, 41, 59); // Slate-800
    doc.rect(0, 0, 210, 38, 'F');

    doc.setTextColor(255, 255, 255);
    doc.setFont('helvetica', 'bold');
    doc.setFontSize(22);
    doc.text(title, 15, 16);

    doc.setFont('helvetica', 'normal');
    doc.setFontSize(10);
    doc.setTextColor(203, 213, 225); // Slate-300
    doc.text(subtitle, 15, 24);
    doc.text(timestamp, 15, 30);

    const headers = lang === 'pt'
      ? [['Data', 'Período', 'Hora', 'Exame Nacional', 'Disciplina / Especialidade']]
      : [['Date', 'Period', 'Time', 'National Exam', 'Subject / Specialty']];

    const sortedExams = [...exams].sort((a, b) => {
      const dateCompare = a.date.localeCompare(b.date);
      if (dateCompare !== 0) return dateCompare;
      return a.time.localeCompare(b.time);
    });

    const body = sortedExams.map(ex => {
      const periodLabel = getPeriodFromTime(ex.time) === "09:00"
        ? (lang === 'pt' ? 'Manhã' : 'Morning')
        : (lang === 'pt' ? 'Tarde' : 'Afternoon');
      return [
        ex.date,
        periodLabel,
        ex.time,
        ex.name,
        ex.subject
      ];
    });

    autoTable(doc, {
      startY: 48,
      head: headers,
      body: body,
      theme: 'striped',
      headStyles: {
        fillColor: [37, 99, 235], // Blue-600 (matches active theme)
        textColor: [255, 255, 255],
        fontStyle: 'bold',
        fontSize: 10
      },
      bodyStyles: {
        fontSize: 9,
        textColor: [30, 41, 59]
      },
      alternateRowStyles: {
        fillColor: [248, 250, 252]
      },
      columnStyles: {
        0: { cellWidth: 28, fontStyle: 'bold' },
        1: { cellWidth: 28 },
        2: { cellWidth: 20 },
        3: { cellWidth: 64, fontStyle: 'bold' },
        4: { cellWidth: 45 }
      },
      margin: { left: 15, right: 15 },
      didDrawPage: (data) => {
        doc.setFontSize(8);
        doc.setTextColor(148, 163, 184);
        const pageCount = doc.getNumberOfPages();
        doc.text(
          `Page ${data.pageNumber} of ${pageCount}`, 
          195, 
          287, 
          { align: 'right' }
        );
      }
    });

    const fileName = lang === 'pt' 
      ? 'exames_registados.pdf' 
      : 'registered_exams.pdf';
    doc.save(fileName);
  };

  const groupedByMonthAndDayList = React.useMemo(() => {
    const sorted = [...exams].sort((a, b) => {
      const dateCompare = a.date.localeCompare(b.date);
      if (dateCompare !== 0) return dateCompare;
      return a.time.localeCompare(b.time);
    });

    const groups: {
      monthKey: string;
      monthDisplay: string;
      days: {
        dayKey: string;
        dayDisplay: string;
        exams: Exam[];
      }[];
    }[] = [];

    sorted.forEach((ex) => {
      let yearStr = '2026';
      let monthStr = '06';
      if (ex.date) {
        const parts = ex.date.split('-');
        if (parts.length > 0) yearStr = parts[0];
        if (parts.length > 1) monthStr = parts[1];
      }
      const monthNum = parseInt(monthStr, 10) || 6;
      const yearNum = parseInt(yearStr, 10) || 2026;
      const monthKey = `${yearStr}-${monthStr}`;
      const monthDisplay = `${getMonthName(monthNum, lang)} ${yearNum}`;

      let monthGroup = groups.find((g) => g.monthKey === monthKey);
      if (!monthGroup) {
        monthGroup = {
          monthKey,
          monthDisplay,
          days: []
        };
        groups.push(monthGroup);
      }

      const dayKey = ex.date;
      const dayDisplay = getDayInfo(ex.date, lang);

      let dayGroup = monthGroup.days.find((d) => d.dayKey === dayKey);
      if (!dayGroup) {
        dayGroup = {
          dayKey,
          dayDisplay,
          exams: []
        };
        monthGroup.days.push(dayGroup);
      }

      dayGroup.exams.push(ex);
    });

    return groups;
  }, [exams, lang]);

  return (
    <div id="exam_manager" className="space-y-6">
      <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-3">
        <div>
          <h2 className="text-xl font-bold text-slate-800">{t.examTitle}</h2>
          <p className="text-slate-500 text-xs">{t.examSubtitle}</p>
        </div>
        <div className="flex items-center gap-2">
          <button
            onClick={handleExportPDF}
            disabled={exams.length === 0}
            className={`flex items-center space-x-1.5 border border-slate-200 text-slate-700 text-xs font-semibold px-4 py-2.5 rounded-lg transition shadow-sm ${
              exams.length === 0
                ? 'opacity-50 cursor-not-allowed bg-slate-50'
                : 'hover:bg-slate-50 cursor-pointer bg-white hover:text-slate-900'
            }`}
          >
            <FileDown className="h-3.5 w-3.5 text-slate-500" />
            <span>{lang === 'pt' ? 'Exportar PDF' : 'Export PDF'}</span>
          </button>

          <button
            onClick={handleOpenAdd}
            className="flex items-center space-x-1.5 bg-blue-600 hover:bg-blue-500 text-white text-xs font-semibold px-4 py-2.5 rounded-lg transition shadow cursor-pointer shrink-0"
          >
            <Plus className="h-3.5 w-3.5" />
            <span>{t.addExam}</span>
          </button>
        </div>
      </div>

      {/* Grouped view for scheduled exams by Month and Day */}
      {exams.length > 0 ? (
        <div className="space-y-8">
          {groupedByMonthAndDayList.map((monthGroup) => (
            <div key={monthGroup.monthKey} className="space-y-6">
              {/* Month Header */}
              <div className="flex items-center space-x-3 pb-2 border-b border-slate-200">
                <Calendar className="h-5 w-5 text-indigo-600 shrink-0" />
                <h3 className="text-base font-bold text-slate-800 tracking-tight capitalize">
                  {monthGroup.monthDisplay}
                </h3>
                <span className="text-[10px] font-semibold bg-indigo-50 text-indigo-700 px-2.5 py-0.5 rounded-full">
                  {monthGroup.days.reduce((acc, d) => acc + d.exams.length, 0)}{' '}
                  {lang === 'pt' ? 'exames' : 'exams'}
                </span>
              </div>

              {/* Day Sections */}
              <div className="space-y-6 pl-1 md:pl-3 border-l-2 border-slate-100">
                {monthGroup.days.map((dayGroup) => (
                  <div key={dayGroup.dayKey} className="space-y-4">
                    {/* Day Title */}
                    <div className="flex items-center space-x-2">
                      <div className="w-1.5 h-1.5 bg-indigo-500 rounded-full" />
                      <h4 className="text-sm font-semibold text-slate-700">
                        {dayGroup.dayDisplay}
                      </h4>
                    </div>

                    {/* List of Exams for this Day (one per row) */}
                    <div className="flex flex-col gap-2 pl-3.5">
                      {dayGroup.exams.map((ex) => (
                        <div 
                          key={ex.id} 
                          className={`bg-white border-y border-r border-l-4 border-slate-200 shadow-sm hover:shadow transition duration-200 rounded-lg px-4 py-3 flex flex-col sm:flex-row sm:items-center sm:justify-between gap-3 relative overflow-hidden ${
                            getPeriodFromTime(ex.time) === '09:00' ? 'border-l-blue-600' : 'border-l-amber-500'
                          }`}
                        >
                          <div className="flex items-center gap-3 min-w-0 flex-1">
                            {/* Color coded circle indication */}
                            <div className={`w-2 h-2 rounded-full shrink-0 ${
                              getPeriodFromTime(ex.time) === '09:00' ? 'bg-blue-600' : 'bg-amber-500'
                            }`} />
                            
                            <div className="min-w-0 flex-1 sm:flex sm:items-center sm:gap-4">
                              <span className="font-bold text-slate-900 text-sm truncate block sm:inline sm:max-w-xs">{ex.name}</span>
                              <span className="text-slate-400 text-[10px] uppercase tracking-wider font-semibold block sm:inline mt-0.5 sm:mt-0">
                                {lang === 'pt' ? 'Especialidade' : 'Spec'}: <strong className="text-slate-700 font-medium">{ex.subject}</strong>
                              </span>
                            </div>
                          </div>

                          <div className="flex items-center justify-between sm:justify-end gap-4 shrink-0">
                            {/* Time display Badge */}
                            <div className={`flex items-center space-x-1 px-2.5 py-1 rounded text-[11px] font-semibold border shrink-0 ${
                              getPeriodFromTime(ex.time) === '09:00' 
                                ? 'bg-blue-50 border-blue-100 text-blue-700' 
                                : 'bg-amber-50 border-amber-100 text-amber-700'
                            }`}>
                              <Clock className="h-3.5 w-3.5 shrink-0" />
                              <span>{getPeriodFromTime(ex.time) === '09:00' ? `${lang === 'pt' ? 'Manhã' : 'Morning'} (${ex.time})` : `${lang === 'pt' ? 'Tarde' : 'Afternoon'} (${ex.time})`}</span>
                            </div>

                            {/* Actions */}
                            <div className="flex space-x-1">
                              <button 
                                onClick={() => handleOpenEdit(ex)}
                                className="p-1.5 text-slate-400 hover:text-indigo-600 hover:bg-slate-50 rounded transition cursor-pointer"
                              >
                                <Edit2 className="h-4 w-4" />
                              </button>
                              <button 
                                onClick={() => onDeleteExam(ex.id)}
                                className="p-1.5 text-slate-400 hover:text-rose-600 hover:bg-slate-50 rounded transition cursor-pointer"
                              >
                                <Trash2 className="h-4 w-4" />
                              </button>
                            </div>
                          </div>
                        </div>
                      ))}
                    </div>
                  </div>
                ))}
              </div>
            </div>
          ))}
        </div>
      ) : (
        <div className="bg-slate-50 border border-slate-200 rounded-xl p-10 text-center text-slate-400 text-xs">
          {t.noExams}
        </div>
      )}

      <style>{`
        @media print {
          /* Hide everything outside the printable listing */
          body * {
            visibility: hidden !important;
          }
          /* Except the printable listing container itself and any children within it */
          #print-exams-section, #print-exams-section * {
            visibility: visible !important;
          }
          #print-exams-section {
            position: absolute !important;
            left: 0 !important;
            top: 0 !important;
            width: 100% !important;
            display: block !important;
            background: white !important;
            color: black !important;
          }
        }
      `}</style>

      {/* Printable template container */}
      <div id="print-exams-section" className="hidden print:block p-8 font-sans bg-white text-slate-900">
        <div className="border-b-[2px] border-slate-800 pb-4 mb-6 flex justify-between items-end">
          <div>
            <h1 className="text-xl font-bold uppercase tracking-wide text-slate-900">
              {lang === 'pt' ? 'Listagem de Exames Nacionais Registados' : 'Registered National Exams List'}
            </h1>
            <p className="text-xs text-slate-500 mt-1">
              {lang === 'pt' ? 'Escola Secundária D. João II - Sistema de Alocações' : 'Secondary School D. João II - Allocation system'}
            </p>
          </div>
          <div className="text-right">
            <p className="text-[10px] font-mono text-slate-500">
              {lang === 'pt' 
                ? `Gerado em: ${new Date().toLocaleDateString('pt-PT')} ${new Date().toLocaleTimeString('pt-PT', {hour: '2-digit', minute:'2-digit'})}`
                : `Generated on: ${new Date().toLocaleDateString()} ${new Date().toLocaleTimeString([], {hour: '2-digit', minute:'2-digit'})}`}
            </p>
          </div>
        </div>

        <table className="w-full text-left text-xs border-collapse">
          <thead>
            <tr className="border-b-[1.5px] border-slate-900 font-bold uppercase tracking-wider text-[10px] text-slate-600">
              <th className="py-2.5 pr-4">{lang === 'pt' ? 'Data' : 'Date'}</th>
              <th className="py-2.5 pr-4">{lang === 'pt' ? 'Hora / Período' : 'Time / Period'}</th>
              <th className="py-2.5 pr-4">{lang === 'pt' ? 'Exame Nacional' : 'National Exam'}</th>
              <th className="py-2.5">{lang === 'pt' ? 'Disciplina / Especialidade' : 'Subject'}</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-slate-200">
            {exams.length > 0 ? (
              [...exams]
                .sort((a, b) => {
                  const dateCompare = a.date.localeCompare(b.date);
                  if (dateCompare !== 0) return dateCompare;
                  return a.time.localeCompare(b.time);
                })
                .map((ex) => (
                  <tr key={ex.id} className="align-middle">
                    <td className="py-3 pr-4 font-semibold text-slate-800 tabular-nums">{ex.date}</td>
                    <td className="py-3 pr-4 font-medium text-slate-600">
                      {ex.time} ({getPeriodFromTime(ex.time) === "09:00" ? (lang === 'pt' ? 'Manhã' : 'Morning') : (lang === 'pt' ? 'Tarde' : 'Afternoon')})
                    </td>
                    <td className="py-3 pr-4 font-bold text-slate-900">{ex.name}</td>
                    <td className="py-3 text-slate-700 font-medium">{ex.subject}</td>
                  </tr>
                ))
            ) : (
              <tr>
                <td colSpan={4} className="py-8 text-center text-slate-400 font-medium">
                  {lang === 'pt' ? 'Nenhum exame nacional registado.' : 'No national exams currently registered.'}
                </td>
              </tr>
            )}
          </tbody>
        </table>
      </div>

      {/* Add / Edit Exam Modal */}
      {isModalOpen && (
        <div className="fixed inset-0 bg-slate-900/60 backdrop-blur-sm flex items-center justify-center p-4 z-50">
          <div className="bg-white rounded-xl shadow-xl w-full max-w-md overflow-hidden border border-slate-200">
            <div className="px-6 py-4 bg-slate-50 border-b border-slate-100 flex justify-between items-center">
              <h3 className="font-bold text-slate-800 text-sm">
                {editingExam ? t.editExam : t.addExam}
              </h3>
              <button onClick={() => setIsModalOpen(false)} className="text-slate-400 hover:text-slate-600 cursor-pointer">
                <X className="h-4 w-4" />
              </button>
            </div>

            <form onSubmit={handleSave} className="p-6 space-y-4">
              <div>
                <label className="block text-[11px] font-semibold text-slate-500 uppercase tracking-wider mb-1">
                  {t.examName} *
                </label>
                <input
                  type="text"
                  required
                  value={name}
                  onChange={(e) => setName(e.target.value)}
                  placeholder="ex. Matemática A - 12º Ano"
                  className="w-full border border-slate-200 rounded-lg px-3.5 py-2 text-xs text-slate-800 focus:outline-none focus:border-blue-500"
                />
              </div>

               <div>
                <div className="flex justify-between items-baseline mb-1">
                  <label className="block text-[11px] font-semibold text-slate-500 uppercase tracking-wider">
                    {t.examSubject} *
                  </label>
                  {uniqueTeacherSubjects.length > 0 && (
                    <button
                      type="button"
                      onClick={() => setIsManualSubject(!isManualSubject)}
                      className="text-[10px] text-blue-600 hover:text-blue-700 hover:underline font-medium cursor-pointer"
                    >
                      {isManualSubject 
                        ? (lang === 'pt' ? 'Escolher da lista' : 'Choose from list') 
                        : (lang === 'pt' ? 'Escrever disciplina' : 'Write manually')
                      }
                    </button>
                  )}
                </div>

                {!isManualSubject && uniqueTeacherSubjects.length > 0 ? (
                  <select
                    required
                    value={subject}
                    onChange={(e) => setSubject(e.target.value)}
                    className="w-full border border-slate-200 rounded-lg px-3.5 py-2 text-xs text-slate-800 focus:outline-none focus:border-blue-500 bg-white"
                  >
                    <option value="">{lang === 'pt' ? '-- Selecione uma Disciplina --' : '-- Select a Subject --'}</option>
                    {uniqueTeacherSubjects.map((sub) => (
                      <option key={sub} value={sub}>{sub}</option>
                    ))}
                    {subject && !uniqueTeacherSubjects.includes(subject) && (
                      <option value={subject}>{subject}</option>
                    )}
                  </select>
                ) : (
                  <input
                    type="text"
                    required
                    value={subject}
                    onChange={(e) => setSubject(e.target.value)}
                    placeholder={lang === 'pt' ? "ex. Matemática" : "e.g. Mathematics"}
                    className="w-full border border-slate-200 rounded-lg px-3.5 py-2 text-xs text-slate-800 focus:outline-none focus:border-blue-500"
                  />
                )}
                {uniqueTeacherSubjects.length === 0 && (
                  <p className="text-[10px] text-amber-600 bg-amber-50 px-2.5 py-1 rounded border border-amber-100/70 mt-1 leading-normal">
                    {lang === 'pt' 
                      ? "Dica: Registe professores primeiro para poder escolher da lista de disciplinas."
                      : "Tip: Register teachers first to choose their subjects from a list."}
                  </p>
                )}
              </div>

              <div className="grid grid-cols-2 gap-4">
                <div>
                  <label className="block text-[11px] font-semibold text-slate-500 uppercase tracking-wider mb-1">
                    {t.date}
                  </label>
                  <input
                    type="date"
                    required
                    value={date}
                    onChange={(e) => setDate(e.target.value)}
                    className="w-full border border-slate-200 rounded-lg px-3.5 py-2 text-xs text-slate-800 focus:outline-none focus:border-blue-500"
                  />
                </div>
                <div>
                  <label className="block text-[11px] font-semibold text-slate-500 uppercase tracking-wider mb-1">
                    {lang === 'pt' ? 'Hora de Início' : 'Start Time'} *
                  </label>
                  <input
                    type="time"
                    required
                    value={time}
                    onChange={(e) => setTime(e.target.value)}
                    className="w-full border border-slate-200 rounded-lg px-3.5 py-2 text-xs text-slate-800 focus:outline-none focus:border-blue-500"
                  />
                </div>
              </div>

              <div className="flex justify-end space-x-2 pt-4 border-t border-slate-100">
                <button
                  type="button"
                  onClick={() => setIsModalOpen(false)}
                  className="px-4 py-2 border border-slate-200 rounded-lg text-xs text-slate-500 hover:bg-slate-50 cursor-pointer"
                >
                  {t.cancel}
                </button>
                <button
                  type="submit"
                  className="px-4 py-2 bg-blue-600 hover:bg-blue-500 text-white rounded-lg text-xs font-semibold cursor-pointer"
                >
                  {t.save}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}
    </div>
  );
}
