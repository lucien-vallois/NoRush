import { Injectable, Logger, BadRequestException } from '@nestjs/common';
import * as puppeteer from 'puppeteer';
import * as handlebars from 'handlebars';
import * as fs from 'fs';
import * as path from 'path';
import { ReportType } from '../dto/generate-report.dto';

interface ReportData {
  metadata: {
    title: string;
    generatedAt: Date;
    period: {
      start: Date;
      end: Date;
    };
    filters: any;
  };
  summary: any;
  data: any;
  charts?: any;
}

@Injectable()
export class PdfReportService {
  private readonly logger = new Logger(PdfReportService.name);
  private templates: Map<string, HandlebarsTemplateDelegate> = new Map();

  constructor() {
    this.registerHelpers();
    this.loadTemplates();
  }

  hasLayout(type: ReportType): boolean {
    return this.templates.has(type);
  }

  async generatePdf(type: ReportType, data: ReportData): Promise<Buffer> {
    try {
      this.logger.log(`Gerando PDF para relatório: ${type}`);

      const template = this.templates.get(type);
      if (!template) {
        // No PDF layout for this report type: a client error, not a crash
        throw new BadRequestException({ code: 'unsupportedReportFormat', format: 'pdf' });
      }

      // Preparar dados para o template
      const templateData = this.prepareTemplateData(data);

      // Renderizar template
      const html = template(templateData);

      // Gerar PDF
      const pdfBuffer = await this.generatePdfFromHtml(html);

      this.logger.log(`PDF gerado com sucesso: ${data.metadata.title}`);

      return pdfBuffer;
    } catch (error) {
      this.logger.error(`Erro ao gerar PDF para ${type}:`, error);
      throw error;
    }
  }

  private async generatePdfFromHtml(html: string): Promise<Buffer> {
    let browser: puppeteer.Browser | undefined;

    try {
      browser = await puppeteer.launch({
        executablePath: process.env.PUPPETEER_EXECUTABLE_PATH || undefined,
        headless: true,
        args: [
          '--no-sandbox',
          '--disable-setuid-sandbox',
          '--disable-dev-shm-usage',
          '--disable-accelerated-2d-canvas',
          '--no-first-run',
          '--no-zygote',
          '--single-process',
          '--disable-gpu',
        ],
      });

      const page = await browser.newPage();

      // Definir viewport
      await page.setViewport({ width: 1200, height: 800 });

      // Carregar HTML
      await page.setContent(html, { waitUntil: 'load' });

      // Puppeteer ≥ 22 returns a Uint8Array; Express only streams a Buffer
      // as binary (a Uint8Array would be serialized as JSON).
      const pdf = await page.pdf({
        format: 'A4',
        printBackground: true,
        margin: {
          top: '20px',
          right: '20px',
          bottom: '20px',
          left: '20px',
        },
        displayHeaderFooter: true,
        headerTemplate: this.getHeaderTemplate(),
        footerTemplate: this.getFooterTemplate(),
      });

      return Buffer.from(pdf);
    } finally {
      if (browser) {
        await browser.close();
      }
    }
  }

  private loadTemplates(): void {
    const templatesDir = path.join(__dirname, '../templates');

    // Template base (usado por todos)
    const baseTemplatePath = path.join(templatesDir, 'base.hbs');
    if (fs.existsSync(baseTemplatePath)) {
      const baseTemplate = fs.readFileSync(baseTemplatePath, 'utf-8');
      handlebars.registerPartial('base', baseTemplate);
    }

    // Templates específicos
    const templateFiles = {
      [ReportType.TANK_LEVEL_HISTORY]: 'tank-level-history.hbs',
      [ReportType.SENSOR_PERFORMANCE]: 'sensor-performance.hbs',
      [ReportType.ALERT_SUMMARY]: 'alert-summary.hbs',
      [ReportType.SYSTEM_OVERVIEW]: 'system-overview.hbs',
      [ReportType.MAINTENANCE_SCHEDULE]: 'maintenance-schedule.hbs',
      [ReportType.PRODUCTION_ANALYSIS]: 'production-analysis.hbs',
    };

    Object.entries(templateFiles).forEach(([type, filename]) => {
      const templatePath = path.join(templatesDir, filename);
      if (fs.existsSync(templatePath)) {
        const templateContent = fs.readFileSync(templatePath, 'utf-8');
        this.templates.set(type, handlebars.compile(templateContent));
      }
    });

    // Not every report type has a PDF layout yet (they all export to Excel):
    // say so once at startup instead of warning once per missing file.
    const withPdf = [...this.templates.keys()];
    const excelOnly = Object.keys(templateFiles).filter(
      (type) => !this.templates.has(type),
    );
    this.logger.log(
      `PDF layouts: ${withPdf.join(', ') || 'none'}` +
        (excelOnly.length ? `; Excel only: ${excelOnly.join(', ')}` : ''),
    );
  }

  private prepareTemplateData(data: ReportData): any {
    return {
      ...data,
      // Helpers para formatação
      formatDate: (date: Date) => {
        return new Intl.DateTimeFormat('pt-BR', {
          day: '2-digit',
          month: '2-digit',
          year: 'numeric',
          hour: '2-digit',
          minute: '2-digit',
        }).format(new Date(date));
      },
      formatNumber: (num: number, decimals: number = 2) => {
        if (num === null || num === undefined || Number.isNaN(Number(num)))
          return '—';
        return Number(num).toFixed(decimals).replace('.', ',');
      },
      formatPercentage: (num: number) => {
        if (num === null || num === undefined || Number.isNaN(Number(num)))
          return '—';
        return `${Number(num).toFixed(1)}%`.replace('.', ',');
      },
      // Helpers usados pelos templates .hbs
      date: (value: any) => value,
      divide: (a: number, b: number) => {
        const na = Number(a);
        const nb = Number(b);
        if (!Number.isFinite(na) || !Number.isFinite(nb) || nb === 0) return 0;
        return na / nb;
      },
      // Estilos base
      styles: this.getBaseStyles(),
    };
  }

  private getBaseStyles(): string {
    return `
      <style>
        body {
          font-family: 'Segoe UI', Tahoma, Geneva, Verdana, sans-serif;
          line-height: 1.6;
          color: #333;
          margin: 0;
          padding: 20px;
        }

        .header {
          text-align: center;
          border-bottom: 2px solid #2563eb;
          padding-bottom: 20px;
          margin-bottom: 30px;
        }

        .title {
          font-size: 24px;
          font-weight: bold;
          color: #2563eb;
          margin: 0;
        }

        .subtitle {
          font-size: 14px;
          color: #666;
          margin: 5px 0 0 0;
        }

        .metadata {
          background: #f8fafc;
          padding: 15px;
          border-radius: 8px;
          margin-bottom: 25px;
          border: 1px solid #e2e8f0;
        }

        .summary {
          display: grid;
          grid-template-columns: repeat(auto-fit, minmax(200px, 1fr));
          gap: 15px;
          margin-bottom: 25px;
        }

        .summary-item {
          background: white;
          padding: 15px;
          border-radius: 8px;
          border: 1px solid #e2e8f0;
          text-align: center;
        }

        .summary-value {
          font-size: 24px;
          font-weight: bold;
          color: #2563eb;
          margin: 0;
        }

        .summary-label {
          font-size: 12px;
          color: #666;
          margin: 5px 0 0 0;
          text-transform: uppercase;
          letter-spacing: 0.5px;
        }

        .table {
          width: 100%;
          border-collapse: collapse;
          margin: 20px 0;
          font-size: 12px;
        }

        .table th,
        .table td {
          padding: 8px 12px;
          text-align: left;
          border-bottom: 1px solid #e2e8f0;
        }

        .table th {
          background: #f8fafc;
          font-weight: 600;
          color: #374151;
        }

        .table tr:nth-child(even) {
          background: #f8fafc;
        }

        .status-badge {
          padding: 4px 8px;
          border-radius: 12px;
          font-size: 11px;
          font-weight: 500;
          text-transform: uppercase;
        }

        .status-active { background: #dcfce7; color: #166534; }
        .status-inactive { background: #fee2e2; color: #991b1b; }
        .status-maintenance { background: #fef3c7; color: #92400e; }
        .status-error { background: #fee2e2; color: #991b1b; }
        .status-online { background: #dcfce7; color: #166534; }
        .status-offline { background: #fee2e2; color: #991b1b; }

        .severity-critical { background: #fee2e2; color: #991b1b; }
        .severity-high { background: #fef3c7; color: #92400e; }
        .severity-medium { background: #fef3c7; color: #d97706; }
        .severity-low { background: #f3f4f6; color: #374151; }

        .chart-placeholder {
          background: #f8fafc;
          border: 2px dashed #cbd5e1;
          border-radius: 8px;
          padding: 40px;
          text-align: center;
          color: #64748b;
          margin: 20px 0;
        }

        .footer {
          margin-top: 40px;
          padding-top: 20px;
          border-top: 1px solid #e2e8f0;
          text-align: center;
          font-size: 11px;
          color: #666;
        }

        @media print {
          body { margin: 0; }
          .page-break { page-break-before: always; }
        }
      </style>
    `;
  }

  private getHeaderTemplate(): string {
    return `
      <div style="font-size: 10px; color: #666; padding: 10px 20px; border-bottom: 1px solid #e2e8f0;">
        NoRush · Remote Tank Gauging
      </div>
    `;
  }

  private getFooterTemplate(): string {
    return `
      <div style="font-size: 10px; color: #666; padding: 10px 20px; border-top: 1px solid #e2e8f0; text-align: center;">
        Página <span class="pageNumber"></span> de <span class="totalPages"></span>
      </div>
    `;
  }

  // Método para criar template genérico quando específico não existe
  private createGenericTemplate(): HandlebarsTemplateDelegate {
    const template = `
      {{> base}}
      <div class="header">
        <h1 class="title">{{metadata.title}}</h1>
        <p class="subtitle">Gerado em {{formatDate metadata.generatedAt}}</p>
      </div>

      <div class="metadata">
        <h3>Informações do Relatório</h3>
        <p><strong>Período:</strong> {{formatDate metadata.period.start}} - {{formatDate metadata.period.end}}</p>
        {{#if metadata.filters.tankIds}}
          <p><strong>Tanques:</strong> {{metadata.filters.tankIds.length}} selecionados</p>
        {{/if}}
        {{#if metadata.filters.sensorIds}}
          <p><strong>Sensores:</strong> {{metadata.filters.sensorIds.length}} selecionados</p>
        {{/if}}
      </div>

      {{#if summary}}
      <div class="summary">
        {{#each summary}}
          <div class="summary-item">
            <div class="summary-value">{{this}}</div>
            <div class="summary-label">{{@key}}</div>
          </div>
        {{/each}}
      </div>
      {{/if}}

      {{#if data}}
      <div>
        <h3>Dados do Relatório</h3>
        {{#if (isArray data)}}
          <table class="table">
            <thead>
              <tr>
                {{#each (first data)}}
                  <th>{{@key}}</th>
                {{/each}}
              </tr>
            </thead>
            <tbody>
              {{#each data}}
                <tr>
                  {{#each this}}
                    <td>{{this}}</td>
                  {{/each}}
                </tr>
              {{/each}}
            </tbody>
          </table>
        {{else}}
          <pre>{{json data}}</pre>
        {{/if}}
      </div>
      {{/if}}

      <div class="footer">
        <p>Relatório gerado automaticamente pelo Sistema Flowback IoT</p>
        <p>© 2024 Flowback IoT Platform</p>
      </div>
    `;

    return handlebars.compile(template);
  }

  // Helpers globais do Handlebars usados pelos templates .hbs
  private registerHelpers(): void {
    handlebars.registerHelper('isArray', function (value) {
      return Array.isArray(value);
    });

    handlebars.registerHelper('first', function (array) {
      return array && array.length > 0 ? array[0] : {};
    });

    handlebars.registerHelper('json', function (context) {
      return JSON.stringify(context, null, 2);
    });

    handlebars.registerHelper('date', function (value) {
      return value;
    });

    handlebars.registerHelper('divide', function (a: any, b: any) {
      const na = Number(a);
      const nb = Number(b);
      if (!Number.isFinite(na) || !Number.isFinite(nb) || nb === 0) return 0;
      return na / nb;
    });

    handlebars.registerHelper('formatDate', function (value: any) {
      if (!value) return '—';
      return new Intl.DateTimeFormat('pt-BR', {
        day: '2-digit',
        month: '2-digit',
        year: 'numeric',
        hour: '2-digit',
        minute: '2-digit',
      }).format(new Date(value));
    });

    handlebars.registerHelper(
      'formatNumber',
      function (num: any, decimals: any) {
        const n = Number(num);
        const d = Number.isFinite(Number(decimals)) ? Number(decimals) : 2;
        if (!Number.isFinite(n)) return '—';
        return n.toFixed(d).replace('.', ',');
      },
    );

    handlebars.registerHelper('formatPercentage', function (num: any) {
      const n = Number(num);
      if (!Number.isFinite(n)) return '—';
      return `${n.toFixed(1)}%`.replace('.', ',');
    });
  }
}
