/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

import React, { useRef } from 'react';
import { Teacher, Room, Exam, Allocation, Language } from '../types';
import { translations } from '../translations';
import { 
  Download, 
  Printer, 
  CheckCircle, 
  FileText
} from 'lucide-react';

import { jsPDF } from 'jspdf';
import autoTable from 'jspdf-autotable';
import { SchoolShipIcon } from './SchoolLogo';
import { getPeriodFromTime } from '../utils/scheduler';

interface ReportManagerProps {
  lang: Language;
  teachers: Teacher[];
  rooms: Room[];
  exams: Exam[];
  allocations: Allocation[];
}

export default function ReportManager({
  lang,
  teachers,
  rooms,
  exams,
  allocations
}: ReportManagerProps) {
  const t = translations[lang];

  // Calculations: count invigilations per teacher (Fatigue counter)
  const teacherStats = teachers.map(tchr => {
    let count = 0;
    allocations.forEach(alloc => {
      if (alloc.invigilator1Id === tchr.id) count++;
      if (alloc.invigilator2Id === tchr.id) count++;
      if (alloc.substituteId === tchr.id) count++;
    });
    return {
      teacher: tchr,
      count
    };
  }).sort((a, b) => b.count - a.count); // sorted by busiest

  // Beautiful Vector PDF export
  const handleExportPDF = () => {
    const doc = new jsPDF({
      orientation: 'portrait',
      unit: 'mm',
      format: 'a4'
    });

    // Filtra apenas os exames que têm alocações atribuídas
    const activeExams = exams.filter(exam => {
      const examAllocs = allocations.filter(a => a.examId === exam.id && (!exam.roomIds || exam.roomIds.length === 0 || exam.roomIds.includes(a.roomId)));
      return examAllocs.length > 0;
    });

    if (activeExams.length === 0) {
      doc.setFont('helvetica', 'normal');
      doc.setFontSize(14);
      doc.text(lang === 'pt' ? 'Nenhuma alocação registada para exportar.' : 'No allocations registered to export.', 15, 20);
      doc.save(`escala_vigilancias_${new Date().toISOString().slice(0, 10)}.pdf`);
      return;
    }

    const title = lang === 'pt' ? 'Escala Oficial de Vigilâncias - Exames Nacionais' : 'Official National Exams Invigilation Scale';
    const schoolName = 'Escola Secundária D. João II';
    const subtitle = lang === 'pt' ? 'Secretariado Geral de Exames e Supervisão Escolar' : 'General Exam Secretariat & School Supervision';
    const schoolYearLabel = lang === 'pt' ? 'Ano Letivo: 2025/2026' : 'School Year: 2025/2026';
    const generatedAtLabel = `${t.reportGeneratedAt}: ${new Date().toISOString().slice(0, 10)}`;

    let currentY = 15;

    // Cabeçalho institucional com fundo escuro (slate-900)
    doc.setFillColor(15, 23, 42); 
    doc.rect(10, currentY, 190, 32, 'F');

    doc.setTextColor(255, 255, 255);
    doc.setFont('helvetica', 'bold');
    doc.setFontSize(14);
    doc.text(schoolName, 15, currentY + 10);

    doc.setFont('helvetica', 'normal');
    doc.setFontSize(9);
    doc.setTextColor(203, 213, 225); 
    doc.text(schoolYearLabel, 15, currentY + 16);

    doc.setFont('helvetica', 'normal');
    doc.setFontSize(8);
    doc.setTextColor(148, 163, 184); 
    doc.text(generatedAtLabel, 15, currentY + 22);

    doc.setFont('helvetica', 'bold');
    doc.setFontSize(11);
    doc.setTextColor(255, 255, 255);
    doc.text(title, 82, currentY + 10, { maxWidth: 110 });

    doc.setFont('helvetica', 'italic');
    doc.setFontSize(8);
    doc.setTextColor(203, 213, 225);
    doc.text(subtitle, 82, currentY + 20, { maxWidth: 110 });

    currentY += 40;

    activeExams.forEach((exam, examIdx) => {
      const examAllocs = allocations.filter(a => a.examId === exam.id && (!exam.roomIds || exam.roomIds.length === 0 || exam.roomIds.includes(a.roomId)));
      const summonedSubs = examAllocs
        .map(alloc => teachers.find(t => t.id === alloc.substituteId))
        .filter((t): t is Teacher => !!t);

      if (examIdx > 0) {
        doc.addPage();
        currentY = 15;
      }

      // Bloco do Exame
      doc.setFillColor(241, 245, 249); 
      doc.rect(10, currentY, 190, 8, 'F');
      
      doc.setDrawColor(15, 23, 42); 
      doc.setLineWidth(1);
      doc.line(10, currentY, 10, currentY + 8);

      doc.setTextColor(15, 23, 42); 
      doc.setFont('helvetica', 'bold');
      doc.setFontSize(10);
      const examPeriod = getPeriodFromTime(exam.time) === '09:00' ? t.periodMorning : t.periodAfternoon;
      const examLabel = `${exam.name}   |   ${exam.date} • ${examPeriod} (${exam.time})`;
      doc.text(examLabel, 13, currentY + 5.5);

      currentY += 10;

      const tableHeaders = lang === 'pt' 
        ? [[t.roomNameCol, t.invigilator1, t.invigilator2, t.presenceSignature]]
        : [[t.roomNameCol, t.invigilator1, t.invigilator2, t.presenceSignature]];

      const tableData = examAllocs.map(alloc => {
        const roomObj = rooms.find(r => r.id === alloc.roomId);
        const v1 = teachers.find(tchr => tchr.id === alloc.invigilator1Id);
        const v2 = teachers.find(tchr => tchr.id === alloc.invigilator2Id);

        const v1Text = v1 ? `${v1.name} (Grp. ${v1.subjectGroup})` : (lang === 'pt' ? 'Matrícula Pendente' : 'To settle');
        const v2Text = v2 ? `${v2.name} (Grp. ${v2.subjectGroup})` : (lang === 'pt' ? 'Matrícula Pendente' : 'To settle');
        const sigText = `${lang === 'pt' ? 'Vig. 1' : 'Inv. 1'}: _________________\n${lang === 'pt' ? 'Vig. 2' : 'Inv. 2'}: _________________`;

        return [
          roomObj ? roomObj.name : 'Vazio',
          v1Text,
          v2Text,
          sigText
        ];
      });

      autoTable(doc, {
        startY: currentY,
        head: tableHeaders,
        body: tableData,
        theme: 'grid',
        headStyles: {
          fillColor: [15, 23, 42],
          textColor: [255, 255, 255],
          fontStyle: 'bold',
          fontSize: 9,
          halign: 'left'
        },
        bodyStyles: {
          fontSize: 8.5,
          textColor: [30, 41, 59],
          valign: 'middle'
        },
        columnStyles: {
          0: { cellWidth: 35, fontStyle: 'bold' },
          1: { cellWidth: 50 },
          2: { cellWidth: 50 },
          3: { cellWidth: 55, fontSize: 7, textColor: [100, 116, 139] } 
        },
        margin: { left: 10, right: 10 },
        styles: {
          cellPadding: 3,
        },
        didDrawPage: (data) => {
          currentY = data.cursor.y;
        }
      });

      currentY += 4;

      if (summonedSubs.length > 0) {
        // ALWAYS on a separate page
        doc.addPage();
        currentY = 15;

        // Clean Slate header for standby sheet
        doc.setFillColor(15, 23, 42); 
        doc.rect(10, currentY, 190, 26, 'F');

        doc.setTextColor(255, 255, 255);
        doc.setFont('helvetica', 'bold');
        doc.setFontSize(12);
        const stTitle = lang === 'pt' ? 'Escala de Professores Suplentes (Reserva Geral)' : 'Standby Reserve Teachers Scale';
        doc.text(stTitle, 15, currentY + 8);

        doc.setFont('helvetica', 'normal');
        doc.setFontSize(8.5);
        doc.setTextColor(203, 213, 225);
        const stExamLabel = `${exam.name}   |   ${exam.date} • ${examPeriod} (${exam.time})`;
        doc.text(stExamLabel, 15, currentY + 14);

        doc.setFont('helvetica', 'italic');
        doc.setFontSize(7.5);
        doc.setTextColor(148, 163, 184);
        const infoText = lang === 'pt' 
          ? '* Estes docentes apresentam-se no Secretariado de Exames para apoio geral e distribuição dinâmica.'
          : '* These teachers report to the Exam Secretariat for general assistance.';
        doc.text(infoText, 15, currentY + 20);

        currentY += 32;

        const subHeaders = lang === 'pt'
          ? [['Professor Suplente', 'Grupo / Especialidade', 'Assinatura de Presença']]
          : [['Standby Teacher', 'Group / Subject', 'Presence Signature']];

        const subBody = summonedSubs.map(tchr => [
          tchr.name,
          `Grp. ${tchr.subjectGroup} - ${tchr.subject}`,
          '______________________________________'
        ]);

        autoTable(doc, {
          startY: currentY,
          head: subHeaders,
          body: subBody,
          theme: 'grid',
          headStyles: {
            fillColor: [37, 99, 235], // Blue-600
            textColor: [255, 255, 255],
            fontStyle: 'bold',
            fontSize: 9,
            halign: 'left'
          },
          bodyStyles: {
            fontSize: 8.5,
            textColor: [30, 41, 59],
            valign: 'middle'
          },
          columnStyles: {
            0: { cellWidth: 70, fontStyle: 'bold' },
            1: { cellWidth: 60 },
            2: { cellWidth: 60 }
          },
          margin: { left: 10, right: 10 },
          styles: {
            cellPadding: 4,
          },
          didDrawPage: (data) => {
            currentY = data.cursor.y;
          }
        });

        currentY += 10;
      }
    });

    if (currentY > 230) {
      doc.addPage();
      currentY = 15;
    } else {
      currentY += 10;
    }

    doc.setDrawColor(226, 232, 240);
    doc.setLineWidth(0.5);
    doc.line(10, currentY, 200, currentY); 
    
    currentY += 8;

    doc.setFont('helvetica', 'normal');
    doc.setFontSize(8);
    doc.setTextColor(148, 163, 184); 
    doc.text(
      lang === 'pt' 
        ? 'Aprovado administrativamente nos termos do regulamento nacional de exames.' 
        : 'Approved administratively under the authority of the national exam regulation.',
      10,
      currentY + 6,
      { maxWidth: 100 }
    );

    doc.setTextColor(30, 41, 59); 
    doc.setFont('helvetica', 'bold');
    doc.setFontSize(9);
    doc.text(t.signatureAdmin, 140, currentY + 6);
    
    doc.setLineWidth(0.2);
    doc.setDrawColor(100, 116, 139);
    doc.line(130, currentY + 16, 190, currentY + 16); 

    doc.setFont('helvetica', 'normal');
    doc.setFontSize(8);
    doc.setTextColor(100, 116, 139); 
    const locationDateText = `Setúbal, ${new Date().toLocaleDateString('pt-PT')}`;
    doc.text(locationDateText, 145, currentY + 21);

    doc.save(`escala_oficial_vigilancias_${new Date().toISOString().slice(0, 10)}.pdf`);
  };

  // Trigger print view & beautiful PDF download together for extreme reliability
  const handlePrint = () => {
    handleExportPDF();
    setTimeout(() => {
      window.print();
    }, 500);
  };

  // Export beautiful editable Microsoft Word (.doc) Document
  const handleExportWord = () => {
    const title = lang === 'pt' ? 'Escala Oficial de Vigilâncias - Exames Nacionais' : 'Official National Exams Invigilation Scale';
    const schoolName = 'Escola Secundária D. João II';
    const yearText = lang === 'pt' ? 'Ano Letivo: 2025/2026' : 'School Year: 2025/2026';
    const secretariatText = lang === 'pt' 
      ? 'Secretariado Geral de Exames e Supervisão Escolar'
      : 'General Exam Secretariat & School Supervision';
    const generatedLabel = lang === 'pt' ? 'Gerado em' : 'Generated on';
    const currentDate = new Date().toISOString().slice(0, 10);

    let htmlContent = `
      <html xmlns:o="urn:schemas-microsoft-com:office:office" 
            xmlns:w="urn:schemas-microsoft-com:office:word" 
            xmlns="http://www.w3.org/TR/REC-html40">
      <head>
        <meta charset="utf-8">
        <title>${title}</title>
        <!--[if gte mso 9]>
        <xml>
          <w:WordDocument>
            <w:View>Print</w:View>
            <w:Zoom>100</w:Zoom>
            <w:DoNotOptimizeForBrowser/>
          </w:WordDocument>
        </xml>
        <![endif]-->
        <style>
          body {
            font-family: 'Segoe UI', Arial, sans-serif;
            color: #1e293b;
            line-height: 1.4;
            padding: 24px;
          }
          .header-table {
            width: 100%;
            border-bottom: 2px solid #0f172a;
            padding-bottom: 12px;
            margin-bottom: 24px;
          }
          .school-name {
            font-size: 14pt;
            font-weight: bold;
            color: #0f172a;
            text-transform: uppercase;
          }
          .school-year {
            font-size: 10pt;
            color: #64748b;
          }
          .generated {
            font-size: 9pt;
            color: #94a3b8;
            text-align: right;
            font-family: 'Courier New', monospace;
          }
          .doc-title {
            text-align: center;
            font-size: 16pt;
            font-weight: bold;
            color: #0f172a;
            text-transform: uppercase;
            margin-top: 20px;
            margin-bottom: 5px;
          }
          .doc-subtitle {
            text-align: center;
            font-size: 10pt;
            color: #64748b;
            font-style: italic;
            margin-bottom: 30px;
          }
          .exam-section {
            margin-bottom: 25px;
          }
          .exam-title-bar {
            background-color: #f1f5f9;
            border-left: 4px solid #0f172a;
            padding: 6px 10px;
            font-weight: bold;
            font-size: 11pt;
            color: #0f172a;
            margin-bottom: 8px;
          }
          table.data-table {
            width: 100%;
            border-collapse: collapse;
            margin-bottom: 25px;
          }
          table.data-table th {
            background-color: #0f172a;
            color: #ffffff;
            font-weight: bold;
            text-align: left;
            padding: 8px;
            font-size: 10pt;
            border: 1px solid #cbd5e1;
            text-transform: uppercase;
          }
          table.data-table td {
            padding: 8px;
            border: 1px solid #cbd5e1;
            font-size: 9.5pt;
            color: #334155;
          }
          .room-cell {
            font-weight: bold;
            color: #0f172a;
          }
          .signature-line {
            font-size: 8pt;
            color: #64748b;
          }
          .reserve-box {
            background-color: #f8fafc;
            border: 1px solid #e2e8f0;
            padding: 10px;
            font-size: 9pt;
            margin-top: 10px;
            margin-bottom: 15px;
          }
          .reserve-title {
            font-weight: bold;
            color: #1e3a8a;
            font-size: 8.5pt;
            text-transform: uppercase;
            margin-bottom: 4px;
          }
          .reserve-body {
            font-weight: bold;
            color: #334155;
          }
          .reserve-meta {
            font-weight: normal;
            color: #94a3b8;
            font-size: 8pt;
          }
          .sign-area {
            margin-top: 40px;
            width: 100%;
          }
          .sign-rules {
            font-size: 8pt;
            color: #94a3b8;
            width: 60%;
          }
          .sign-coord {
            text-align: center;
            font-size: 10pt;
            font-weight: bold;
            width: 40%;
          }
          .sign-line {
            border-bottom: 1px solid #64748b;
            width: 80%;
            margin: 25px auto 5px auto;
            height: 1px;
          }
          .location-date {
            font-size: 8.5pt;
            color: #64748b;
            text-align: center;
          }
        </style>
      </head>
      <body>
        <table class="header-table" border="0" cellspacing="0" cellpadding="0">
          <tr>
            <td>
              <div class="school-name">${schoolName}</div>
              <div class="school-year">${yearText}</div>
            </td>
            <td align="right" valign="bottom">
              <div class="generated">${generatedLabel}: ${currentDate}</div>
            </td>
          </tr>
        </table>

        <div class="doc-title">${title}</div>
        <div class="doc-subtitle">${secretariatText}</div>

        <div class="scale-container">
    `;

    exams.forEach((exam, examIdx) => {
      const examAllocs = allocations.filter(a => a.examId === exam.id && (!exam.roomIds || exam.roomIds.length === 0 || exam.roomIds.includes(a.roomId)));
      if (examAllocs.length === 0) return;

      const summonedSubs = examAllocs
        .map(alloc => teachers.find(t => t.id === alloc.substituteId))
        .filter((t): t is Teacher => !!t);

      const examPeriod = getPeriodFromTime(exam.time) === '09:00' ? t.periodMorning : t.periodAfternoon;
      
      const pageBreakBefore = examIdx > 0 ? 'style="page-break-before: always; break-before: page;"' : '';

      htmlContent += `
        <div class="exam-section" ${pageBreakBefore}>
          <div class="exam-title-bar">
            ${exam.name} &nbsp;&nbsp;|&nbsp;&nbsp; ${exam.date} &bull; ${examPeriod} (${exam.time})
          </div>
          <table class="data-table" border="1" cellspacing="0" cellpadding="6">
            <thead>
              <tr>
                <th width="20%">${t.roomNameCol}</th>
                <th width="30%">${t.invigilator1}</th>
                <th width="30%">${t.invigilator2}</th>
                <th width="20%">${t.presenceSignature}</th>
              </tr>
            </thead>
            <tbody>
      `;

      examAllocs.forEach(alloc => {
        const roomObj = rooms.find(r => r.id === alloc.roomId);
        const v1 = teachers.find(tchr => tchr.id === alloc.invigilator1Id);
        const v2 = teachers.find(tchr => tchr.id === alloc.invigilator2Id);

        const rName = roomObj ? roomObj.name : 'Vazio';
        const v1Text = v1 ? `${v1.name} (Grp. ${v1.subjectGroup})` : (lang === 'pt' ? 'Matrícula Pendente' : 'To settle');
        const v2Text = v2 ? `${v2.name} (Grp. ${v2.subjectGroup})` : (lang === 'pt' ? 'Matrícula Pendente' : 'To settle');

        htmlContent += `
          <tr>
            <td class="room-cell">${rName}</td>
            <td>${v1Text}</td>
            <td>${v2Text}</td>
            <td>
              <div class="signature-line">${lang === 'pt' ? 'Vig. 1' : 'Inv. 1'}: ________________</div>
              <div class="signature-line" style="margin-top: 4px;">${lang === 'pt' ? 'Vig. 2' : 'Inv. 2'}: ________________</div>
            </td>
          </tr>
        `;
      });

      htmlContent += `
            </tbody>
          </table>
        </div>
      `;

      if (summonedSubs.length > 0) {
        htmlContent += `
          <div class="exam-section" style="page-break-before: always; break-before: page;">
            <table class="header-table" border="0" cellspacing="0" cellpadding="0" style="margin-bottom: 12px; border-bottom: 1px solid #cbd5e1;">
              <tr>
                <td>
                  <div style="font-size: 11pt; font-weight: bold; color: #0f172a;">${schoolName}</div>
                  <div style="font-size: 8pt; color: #64748b;">${yearText}</div>
                </td>
                <td align="right" valign="bottom">
                  <div style="font-size: 7.5pt; color: #94a3b8;">${generatedLabel}: ${currentDate}</div>
                </td>
              </tr>
            </table>

            <div class="exam-title-bar" style="background-color: #0f172a; color: #ffffff; border-left: 4px solid #2563eb; padding: 8px 12px; font-weight: bold; font-size: 11pt; margin-bottom: 2px; text-transform: uppercase;">
              ${lang === 'pt' ? 'Escala de Professores Suplentes (Reserva Geral)' : 'Standby Reserve Teachers Scale'}
            </div>
            
            <p style="font-size: 9.5pt; font-weight: bold; color: #1e293b; margin-top: 6px; margin-bottom: 4px;">
              ${exam.name} &bull; ${exam.date} &bull; ${examPeriod} (${exam.time})
            </p>
            <p style="font-size: 8.5pt; color: #64748b; font-style: italic; margin-bottom: 16px;">
              ${lang === 'pt' 
                ? '* Estes docentes não têm sala atribuída permanentemente. Apresentam-se no Secretariado de Exames para apoio geral e distribuição dinâmica.'
                : '* These teachers do not have a dedicated room assigned. They report to the Exam Secretariat for general assistance.'}
            </p>

            <table class="data-table" border="1" cellspacing="0" cellpadding="8" style="width: 100%; border-collapse: collapse; margin-bottom: 25px;">
              <thead>
                <tr style="background-color: #2563eb; color: #ffffff;">
                  <th width="45%" style="text-align: left; padding: 8px; font-size: 10pt; font-weight: bold; border: 1px solid #cbd5e1;">${lang === 'pt' ? 'Professor Suplente' : 'Standby Teacher'}</th>
                  <th width="30%" style="text-align: left; padding: 8px; font-size: 10pt; font-weight: bold; border: 1px solid #cbd5e1;">${lang === 'pt' ? 'Grupo / Especialidade' : 'Group / Subject'}</th>
                  <th width="25%" style="text-align: left; padding: 8px; font-size: 10pt; font-weight: bold; border: 1px solid #cbd5e1;">${lang === 'pt' ? 'Assinatura de Presença' : 'Presence Signature'}</th>
                </tr>
              </thead>
              <tbody>
        `;
        
        summonedSubs.forEach(tchr => {
          htmlContent += `
            <tr>
              <td style="padding: 8px; font-size: 9.5pt; font-weight: bold; border: 1px solid #cbd5e1; color: #0f172a;">${tchr.name}</td>
              <td style="padding: 8px; font-size: 9.5pt; border: 1px solid #cbd5e1; color: #334155;">Grp. ${tchr.subjectGroup} - ${tchr.subject}</td>
              <td style="padding: 8px; font-size: 9.5pt; border: 1px solid #cbd5e1; color: #64748b; text-align: center;">_______________________</td>
            </tr>
          `;
        });

        htmlContent += `
              </tbody>
            </table>
          </div>
        `;
      }
    });

    htmlContent += `
        </div>

        <table class="sign-area" border="0" cellspacing="0" cellpadding="0">
          <tr>
            <td class="sign-rules" valign="top">
              Aprovado administrativamente nos termos do regulamento nacional de exames.
            </td>
            <td class="sign-coord" valign="top">
              ${t.signatureAdmin}
              <div class="sign-line"></div>
              <div class="location-date">Setúbal, ${new Date().toLocaleDateString('pt-PT')}</div>
            </td>
          </tr>
        </table>
      </body>
      </html>
    `;

    const blob = new Blob(['\ufeff' + htmlContent], { type: 'application/msword;charset=utf-8;' });
    const url = URL.createObjectURL(blob);
    const link = document.createElement("a");
    link.setAttribute("href", url);
    link.setAttribute("download", `escala_oficial_vigilancias_${new Date().toISOString().slice(0, 10)}.doc`);
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
  };

  return (
    <div id="report_manager" className="space-y-6">
      {/* Dynamic CSS Print Styles to isolate only the Official Sheet on global print */}
      <style>{`
        @media print {
          body * {
            visibility: hidden !important;
          }
          #print-report-sheet, #print-report-sheet * {
            visibility: visible !important;
          }
          #print-report-sheet {
            position: absolute !important;
            left: 0 !important;
            top: 0 !important;
            width: 100% !important;
            display: block !important;
            border: none !important;
            padding: 0 !important;
            margin: 0 !important;
            background: white !important;
            color: black !important;
          }
          .print-break-before {
            page-break-before: always !important;
            break-before: page !important;
          }
        }
      `}</style>

      <div className="flex flex-col sm:flex-row justify-between items-start sm:items-center gap-4 print:hidden">
        <div>
          <h2 className="text-xl font-bold text-slate-800">{t.reportsTitle}</h2>
          <p className="text-slate-500 text-xs">{t.reportsSubtitle}</p>
        </div>
        <div className="flex gap-2">
          <button
            onClick={handleExportWord}
            className="flex items-center space-x-1.5 bg-blue-600 hover:bg-blue-500 text-white text-xs font-semibold px-4 py-2.5 rounded-lg transition shadow cursor-pointer"
          >
            <FileText className="h-4 w-4" />
            <span>{t.exportWord}</span>
          </button>
          <button
            onClick={handlePrint}
            className="flex items-center space-x-1.5 bg-slate-100 hover:bg-slate-200 border border-slate-200 text-slate-700 text-xs font-semibold px-4 py-2.5 rounded-lg transition shadow cursor-pointer"
          >
            <Printer className="h-4 w-4" />
            <span>{t.exportPdf}</span>
          </button>
        </div>
      </div>

      {/* Grid of details */}
      <div className="grid grid-cols-1 lg:grid-cols-12 gap-6 items-start">
        
        {/* Left Side: Report official Preview (Perfect Print Layout) */}
        <div className="lg:col-span-8 bg-white border border-slate-200 rounded-xl shadow-sm p-6 print:border-0 print:shadow-none print:p-0">
          <div className="text-slate-400 text-xs font-semibold tracking-wider uppercase mb-4 border-b border-slate-100 pb-2 print:hidden flex justify-between items-center">
            <span>{t.previewTitle}</span>
            <span className="text-[10px] text-slate-400 normal-case italic font-normal">
              {lang === 'pt' ? 'Para exportar em PDF real, use Atalho Ctrl+P de Impressão' : 'Use Ctrl+P / print and choose Save as PDF'}
            </span>
          </div>

          {/* Official Document Sheet */}
          <div id="print-report-sheet" className="border border-slate-200 rounded-lg p-6 md:p-8 space-y-6 print:border-0 print:p-0 bg-white">
            {/* School Header */}
            <div className="flex justify-between items-start border-b-2 border-slate-800 pb-4">
              <div className="space-y-1">
                <div className="flex items-center space-x-1.5 font-bold text-slate-900 text-xs tracking-wide uppercase">
                  <SchoolShipIcon className="h-5 w-5 text-blue-600 print:hidden" color="#2563eb" />
                  <span>Escola Secundária D. João II</span>
                </div>
                <p className="text-[10px] text-slate-500 uppercase tracking-widest">{t.schoolYear}</p>
              </div>
              <div className="text-right text-[10px] text-slate-400 font-mono">
                {t.reportGeneratedAt}: {new Date().toISOString().slice(0, 10)}
              </div>
            </div>

            {/* Title */}
            <div className="text-center space-y-1 py-2">
              <h1 className="text-base font-extrabold text-slate-900 uppercase tracking-wide">
                {t.reportHeader}
              </h1>
              <p className="text-xs text-slate-500 italic">
                Secretariado Geral de Exames e Supervisão Escolar
              </p>
            </div>

            {/* Scale entries by exam */}
            <div className="space-y-6">
              {exams.map((exam, examIdx) => {
                const examAllocs = allocations.filter(a => a.examId === exam.id && (!exam.roomIds || exam.roomIds.length === 0 || exam.roomIds.includes(a.roomId)));
                if (examAllocs.length === 0) return null;
                const summonedSubs = examAllocs
                  .map(alloc => teachers.find(t => t.id === alloc.substituteId))
                  .filter((t): t is Teacher => !!t);

                return (
                  <div key={exam.id} className={`space-y-4 ${examIdx > 0 ? 'print-break-before pt-6 print:pt-0' : ''}`}>
                    <div className="bg-slate-100/80 px-3 py-1.5 rounded flex justify-between items-center text-xs text-slate-800 font-bold border-l-4 border-slate-800">
                      <span>{exam.name}</span>
                      <span className="font-mono text-[11px]">
                        {exam.date} • {getPeriodFromTime(exam.time) === '09:00' ? t.periodMorning : t.periodAfternoon} ({exam.time})
                      </span>
                    </div>

                    {examAllocs.length > 0 && (
                      <table className="w-full text-left border-collapse text-[11px] text-slate-700">
                        <thead>
                          <tr className="border-b border-slate-350 text-slate-700 text-[10px] font-bold uppercase">
                            <th className="py-1 px-2">{t.roomNameCol}</th>
                            <th className="py-1 px-2">{t.invigilator1}</th>
                            <th className="py-1 px-2">{t.invigilator2}</th>
                            <th className="py-1 px-2 border-l border-slate-200">{t.presenceSignature}</th>
                          </tr>
                        </thead>
                        <tbody className="divide-y divide-slate-150">
                          {examAllocs.map(alloc => {
                            const roomObj = rooms.find(r => r.id === alloc.roomId);
                            const v1 = teachers.find(tchr => tchr.id === alloc.invigilator1Id);
                            const v2 = teachers.find(tchr => tchr.id === alloc.invigilator2Id);

                            return (
                              <tr key={alloc.id} className="hover:bg-slate-50/50">
                                <td className="py-2 px-2 font-bold text-slate-900">
                                  {roomObj ? roomObj.name : 'Vazio'}
                                </td>
                                <td className="py-2 px-2">
                                  {v1 ? `${v1.name} (Grp. ${v1.subjectGroup})` : <span className="text-rose-600 italic">Por fechar</span>}
                                </td>
                                <td className="py-2 px-2">
                                  {v2 ? `${v2.name} (Grp. ${v2.subjectGroup})` : <span className="text-rose-600 italic">Por fechar</span>}
                                </td>
                                <td className="py-2 px-2 border-l border-slate-200">
                                  <div className="flex flex-col space-y-1 md:min-w-[180px]">
                                    <div className="text-[9px] text-slate-500 font-sans flex items-center justify-between gap-1">
                                      <span className="truncate max-w-[110px] text-slate-600 font-medium">
                                        {lang === 'pt' ? 'Vig. 1' : 'Inv. 1'}:
                                      </span>
                                      <span className="inline-block w-20 border-b border-slate-300 h-3"></span>
                                    </div>
                                    <div className="text-[9px] text-slate-500 font-sans flex items-center justify-between gap-1">
                                      <span className="truncate max-w-[110px] text-slate-600 font-medium">
                                        {lang === 'pt' ? 'Vig. 2' : 'Inv. 2'}:
                                      </span>
                                      <span className="inline-block w-20 border-b border-slate-300 h-3"></span>
                                    </div>
                                  </div>
                                </td>
                              </tr>
                            );
                          })}
                        </tbody>
                      </table>
                    )}

                    {summonedSubs.length > 0 && (
                      <div className="mt-6 pt-6 print:pt-0 print-break-before space-y-4">
                        {/* Print-only head layout to mimic official sheet for standalone standby list */}
                        <div className="hidden print:flex justify-between items-start border-b-2 border-slate-800 pb-4 mb-4">
                          <div className="space-y-1">
                            <div className="flex items-center space-x-1.5 font-bold text-slate-900 text-xs tracking-wide uppercase">
                              <span>Escola Secundária D. João II</span>
                            </div>
                            <p className="text-[10px] text-slate-500 uppercase tracking-widest">{t.schoolYear}</p>
                          </div>
                          <div className="text-right text-[10px] text-slate-400 font-mono">
                            {t.reportGeneratedAt}: {new Date().toISOString().slice(0, 10)}
                          </div>
                        </div>

                        {/* Title block for standby section */}
                        <div className="bg-slate-50/50 print:bg-transparent rounded-lg border border-slate-200/65 p-4 print:p-0 print:border-0 space-y-3">
                          <div className="flex justify-between items-center bg-slate-150 px-3 py-1.5 rounded font-bold text-xs text-slate-800 border-l-4 border-blue-600 print:text-slate-950 font-sans uppercase">
                            <span>{lang === 'pt' ? 'Escala de Professores Suplentes (Reserva Geral)' : 'Standby Reserve Teachers Scale'}</span>
                            <span className="font-mono text-[10px] normal-case font-normal text-slate-500 print:text-slate-700">
                              {exam.name} • {exam.date}
                            </span>
                          </div>
                          <p className="text-[10px] text-slate-500 italic">
                            {lang === 'pt' 
                              ? '* Estes docentes não têm sala atribuída permanentemente. Apresentam-se no Secretariado de Exames para apoio geral e distribuição dinâmica.'
                              : '* These teachers do not have a dedicated room assigned. They report to the Exam Secretariat for general assistance.'}
                          </p>

                          <table className="w-full text-left border-collapse text-[11px] text-slate-700 mt-3">
                            <thead>
                              <tr className="border-b border-slate-350 text-slate-700 text-[10px] font-bold uppercase">
                                <th className="py-2 px-2 w-[45%]">{lang === 'pt' ? 'Professor Suplente' : 'Standby Teacher'}</th>
                                <th className="py-2 px-2 w-[30%]">{lang === 'pt' ? 'Grupo / Especialidade' : 'Group / Subject'}</th>
                                <th className="py-2 px-2 border-l border-slate-250 w-[25%]">{lang === 'pt' ? 'Assinatura de Presença' : 'Presence Signature'}</th>
                              </tr>
                            </thead>
                            <tbody className="divide-y divide-slate-150">
                              {summonedSubs.map((tchr) => (
                                <tr key={tchr.id} className="hover:bg-slate-50/50">
                                  <td className="py-2.5 px-2 font-bold text-slate-900">{tchr.name}</td>
                                  <td className="py-2.5 px-2 text-slate-600">Grp. {tchr.subjectGroup} - {tchr.subject}</td>
                                  <td className="py-2.5 px-2 border-l border-slate-200">
                                    <div className="flex items-center justify-between gap-1 w-full max-w-[200px]">
                                      <span className="text-[9px] text-slate-400">Assinatura:</span>
                                      <span className="inline-block w-32 border-b border-slate-300 h-3"></span>
                                    </div>
                                  </td>
                                </tr>
                              ))}
                            </tbody>
                          </table>
                        </div>
                      </div>
                    )}
                  </div>
                );
              })}
            </div>

            {/* Official Signature spacer footer */}
            <div className="pt-12 flex justify-between items-end border-t border-slate-200">
              <div className="text-[10px] text-slate-400">
                Aprovado administrativamente nos termos do regulamento nacional de exames.
              </div>
              <div className="text-center space-y-4 pr-6">
                <p className="text-xs font-bold text-slate-800">{t.signatureAdmin}</p>
                <div className="w-48 border-b border-slate-400 mx-auto h-6"></div>
                <p className="text-[10px] text-slate-400 font-mono">Setúbal, {new Date().toISOString().slice(0, 10)}</p>
              </div>
            </div>
          </div>
        </div>

        {/* Right Side: Fatigue Counter and distribution check list */}
        <div className="lg:col-span-4 bg-white border border-slate-200 rounded-xl shadow-sm p-5 print:hidden space-y-5">
          <div>
            <h3 className="font-bold text-slate-800 text-sm mb-1">
              {lang === 'pt' ? 'Métricas de Carga Horária' : 'Invigilation Load Metrics'}
            </h3>
            <p className="text-slate-500 text-[11px]">
              {lang === 'pt' 
                ? 'Número de exames atribuídos a cada docente (para evitar sobrecarga).' 
                : 'Exams allotted count to maintain fair distribution of fatigue factors.'}
            </p>
          </div>

          <div className="space-y-2 max-h-96 overflow-y-auto pr-1">
            {teacherStats.map(({ teacher, count }) => (
              <div 
                key={teacher.id} 
                className="flex items-center justify-between border-b border-slate-50 py-1.5 text-xs"
              >
                <div className="space-y-0.5">
                  <span className="font-semibold text-slate-800 block leading-tight">{teacher.name}</span>
                  <span className="text-[10px] text-slate-400 block font-mono">{teacher.subject} • Grp.{teacher.subjectGroup}</span>
                </div>
                {/* Counter bubble */}
                <div className="flex items-center space-x-1.5">
                  <span className={`px-2.5 py-0.5 font-bold rounded-full font-mono text-[11px] ${
                    count === 0 
                      ? 'bg-slate-50 text-slate-400 border border-slate-200/50' 
                      : count > 2 
                        ? 'bg-rose-50 border border-rose-200 text-rose-800' 
                        : 'bg-blue-50 border border-blue-200 text-blue-800'
                  }`}>
                    {count} {lang === 'pt' ? 'vig.' : 'inv.'}
                  </span>
                </div>
              </div>
            ))}
          </div>
        </div>

      </div>
    </div>
  );
}
