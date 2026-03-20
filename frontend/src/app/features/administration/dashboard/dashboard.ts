import { Component, ChangeDetectionStrategy } from '@angular/core';
import { CommonModule } from '@angular/common';
import { Router } from '@angular/router';
import { CardModule } from 'primeng/card';
import { ChartModule } from 'primeng/chart';
import { TableModule } from 'primeng/table';
import { ButtonModule } from 'primeng/button';

@Component({
  selector: 'app-dashboard',
  changeDetection: ChangeDetectionStrategy.OnPush,
  standalone: true,
  imports: [CommonModule, CardModule, ChartModule, TableModule, ButtonModule],
  templateUrl: './dashboard.html',
})
export class Dashboard {
  constructor(private router: Router) {}
  programSummary = [
    {
      name: 'PEAC',
      items: 128,
      collections: 6,
      color: 'var(--gob-azul-gobierno)',
      bg: 'var(--gob-celeste-cielo)',
    },
    {
      name: 'PRONEA',
      items: 96,
      collections: 4,
      color: 'var(--gob-oportunidad-dark)',
      bg: 'var(--gob-oportunidad-light)',
    },
    {
      name: 'Modalidades Flexibles',
      items: 74,
      collections: 5,
      color: 'var(--gob-seguridad)',
      bg: 'var(--gob-seguridad-light)',
    },
    {
      name: 'PROBEFI',
      items: 42,
      collections: 2,
      color: 'var(--gob-ocre-oscuro)',
      bg: 'var(--gob-ocre-claro)',
    },
  ];

  totalSolicitudes = '9,289';
  becasAdjudicadas = '8,193';

  tableRows = [
    {
      depto: 'Baja Verapaz',
      muni: 'San Miguel Chicaj',
      nombre: 'Mendoza Lopez Jaqueline Mayari',
      edad: 24,
      trayectoria: 'Ingles Inicial',
      total: 500,
    },
    {
      depto: 'Baja Verapaz',
      muni: 'San Miguel Chicaj',
      nombre: 'Vasquez Cahueque Nidial Lish',
      edad: 27,
      trayectoria: 'Ingles Inicial',
      total: 2200,
    },
    {
      depto: 'Chimaltenango',
      muni: 'Acatenango',
      nombre: 'Cua Guzman Maria Gorety',
      edad: 32,
      trayectoria: 'Ingles Inicial',
      total: 2200,
    },
    {
      depto: 'Chimaltenango',
      muni: 'Chimaltenango',
      nombre: 'Apu Nauc Wendy Clarilo',
      edad: 27,
      trayectoria: 'Ingles Inicial',
      total: 2200,
    },
    {
      depto: 'Quiche',
      muni: 'Uspantan',
      nombre: 'Abon Jacu Stiven Gabriel',
      edad: 23,
      trayectoria: 'Ingles Inicial',
      total: 2200,
    },
  ];

  deptoData = {
    labels: [
      'Guatemala',
      'Alta Verapaz',
      'Quetzaltenango',
      'Chimaltenango',
      'Quiche',
      'Escuintla',
      'San Marcos',
    ],
    datasets: [
      {
        label: 'Beneficiarios',
        data: [3354, 1145, 934, 812, 741, 658, 612],
        backgroundColor: '#1E3159',
      },
    ],
  };

  deptoOptions = {
    indexAxis: 'y',
    maintainAspectRatio: false,
    plugins: { legend: { display: false } },
    scales: {
      x: { ticks: { maxTicksLimit: 5 } },
      y: { ticks: { autoSkip: false, font: { size: 10 } } },
    },
    layout: { padding: { right: 8 } },
  };

  trayectoriaData = {
    labels: ['Inicial 2 horas', 'Intermedia 3 horas', 'Intensiva 4 horas'],
    datasets: [
      {
        data: [7688, 1250, 351],
        backgroundColor: ['#1E3159', '#233E72', '#CCF0FF'],
      },
    ],
  };

  trayectoriaSummary = [
    { label: 'Inicial 2 horas', value: '7,688 (83.6%)' },
    { label: 'Intermedia 3 horas', value: '1,250 (13.6%)' },
    { label: 'Intensiva 4 horas', value: '351 (3.8%)' },
  ];

  generoData = {
    labels: ['F', 'M'],
    datasets: [
      {
        data: [6731, 3258],
        backgroundColor: ['#1E3159', '#0b3a75'],
      },
    ],
  };

  generoSummary = [
    { label: 'F', value: '6,731 (67.3%)' },
    { label: 'M', value: '3,258 (32.7%)' },
  ];

  trabajanData = {
    labels: ['No', 'Si'],
    datasets: [
      {
        label: 'Beneficiarios',
        data: [5374, 4462],
        backgroundColor: ['#1E3159', '#233E72'],
      },
    ],
  };

  trabajanSummary = [
    { label: 'No', value: '5,374 (53.7%)' },
    { label: 'Si', value: '4,462 (46.2%)' },
  ];

  trabajanOptions = {
    indexAxis: 'y',
    maintainAspectRatio: false,
    plugins: { legend: { display: false } },
    scales: {
      x: { ticks: { maxTicksLimit: 4 } },
      y: { ticks: { autoSkip: false, font: { size: 10 } } },
    },
  };

  etniaData = {
    labels: ['Ladino', 'Maya', 'Otra', 'Xinka', 'Garifuna'],
    datasets: [
      {
        label: 'Beneficiarios',
        data: [7958, 1833, 102, 38, 19],
        backgroundColor: '#1E3159',
      },
    ],
  };

  edadData = {
    labels: ['15-17', '18-20', '21-25', '26-30', '31-40', '41-50', '51-60'],
    datasets: [
      {
        label: 'Beneficiarios',
        data: [554, 1324, 2315, 2620, 906, 318, 84],
        backgroundColor: '#1E3159',
      },
    ],
  };

  ejecucionData = {
    labels: ['Estipendios', 'Formacion INTECAP', 'Servicios CNH', 'Auditoria externa'],
    datasets: [
      {
        label: 'Millones',
        data: [12.15, 9.86, 2.01, 0.09],
        backgroundColor: ['#1E3159', '#026961', '#FE8B5A', '#F2A119'],
      },
    ],
  };

  ejecucionSummary = [
    { label: 'Estipendios', value: 'Q12.15 mil.' },
    { label: 'Formacion INTECAP', value: 'Q9.86 mil.' },
    { label: 'Servicios CNH', value: 'Q2.01 mil.' },
    { label: 'Auditoria externa', value: 'Q0.09 mil.' },
  ];

  fondoData = {
    labels: ['2026', '2025'],
    datasets: [
      {
        data: [28.59, 21.41],
        backgroundColor: ['#1E3159', '#233E72'],
      },
    ],
  };

  fondoSummary = [
    { label: '2026', value: 'Q28.59 mil. (57.18%)' },
    { label: '2025', value: 'Q21.41 mil. (42.82%)' },
  ];

  simpleOptions = {
    maintainAspectRatio: false,
    responsive: true,
    plugins: {
      legend: {
        position: 'bottom',
        labels: { boxWidth: 10, boxHeight: 10, padding: 12, font: { size: 10 } },
      },
    },
    scales: {
      x: { ticks: { autoSkip: true, maxTicksLimit: 6, font: { size: 10 } } },
      y: { ticks: { autoSkip: true, maxTicksLimit: 5, font: { size: 10 } } },
    },
  };

  goBack() {
    this.router.navigate(['/']);
  }
}
