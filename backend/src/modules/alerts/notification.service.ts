import { Injectable, Logger } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { Alert, AlertSeverity, AlertType } from '../../entities/alert.entity';
import { User, UserRole } from '../../entities/user.entity';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';

interface NotificationChannel {
  name: string;
  enabled: boolean;
  send: (alert: Alert, users: User[]) => Promise<void>;
}

interface NotificationRule {
  severity: AlertSeverity;
  channels: string[];
  immediate: boolean; // Enviar imediatamente ou em lote
}

@Injectable()
export class NotificationService {
  private readonly logger = new Logger(NotificationService.name);
  private channels = new Map<string, NotificationChannel>();
  private notificationRules: NotificationRule[] = [
    {
      severity: AlertSeverity.CRITICAL,
      channels: ['email', 'sms', 'push'],
      immediate: true,
    },
    {
      severity: AlertSeverity.HIGH,
      channels: ['email', 'push'],
      immediate: true,
    },
    {
      severity: AlertSeverity.MEDIUM,
      channels: ['email'],
      immediate: false,
    },
    {
      severity: AlertSeverity.LOW,
      channels: ['email'],
      immediate: false,
    },
  ];

  constructor(
    private configService: ConfigService,
    @InjectRepository(User)
    private userRepository: Repository<User>,
  ) {
    this.initializeChannels();
  }

  async notifyAlert(alert: Alert): Promise<void> {
    try {
      // Determinar usuários para notificar baseado na severidade
      const users = await this.getUsersForAlert(alert);

      if (users.length === 0) {
        this.logger.debug(`Nenhum usuário encontrado para alerta ${alert.id}`);
        return;
      }

      // Encontrar regra de notificação
      const rule = this.notificationRules.find(
        (r) => r.severity === alert.severity,
      );

      if (!rule) {
        this.logger.warn(
          `Nenhuma regra de notificação encontrada para severidade ${alert.severity}`,
        );
        return;
      }

      // Enviar notificações pelos canais configurados
      const notifications = rule.channels.map((channelName) => {
        const channel = this.channels.get(channelName);
        if (channel && channel.enabled) {
          return channel.send(alert, users);
        }
        return Promise.resolve();
      });

      await Promise.allSettled(notifications);

      this.logger.log(
        `Notificações enviadas para alerta ${alert.id}: ${rule.channels.join(', ')} (${users.length} usuários)`,
      );
    } catch (error) {
      this.logger.error(
        `Erro ao enviar notificações para alerta ${alert.id}:`,
        error,
      );
    }
  }

  async notifyAlertBatch(alerts: Alert[]): Promise<void> {
    // Agrupar alertas por severidade
    const alertsBySeverity = alerts.reduce(
      (acc, alert) => {
        if (!acc[alert.severity]) {
          acc[alert.severity] = [];
        }
        acc[alert.severity].push(alert);
        return acc;
      },
      {} as Record<AlertSeverity, Alert[]>,
    );

    // Enviar notificações em lote por severidade
    for (const [severity, severityAlerts] of Object.entries(alertsBySeverity)) {
      const rule = this.notificationRules.find(
        (r) => r.severity === (severity as AlertSeverity),
      );

      if (rule && !rule.immediate) {
        // Enviar resumo em lote
        await this.sendBatchNotification(
          severity as AlertSeverity,
          severityAlerts,
        );
      }
    }
  }

  private async getUsersForAlert(alert: Alert): Promise<User[]> {
    let users: User[];

    switch (alert.severity) {
      case AlertSeverity.CRITICAL:
        // Notificar todos os usuários ativos
        users = await this.userRepository.find({
          where: { isActive: true },
        });
        break;

      case AlertSeverity.HIGH:
        // Notificar operadores e administradores
        users = await this.userRepository
          .createQueryBuilder('user')
          .where('user.isActive = true')
          .andWhere('user.role IN (:...roles)', {
            roles: ['admin', 'operator'],
          })
          .getMany();
        break;

      case AlertSeverity.MEDIUM:
      case AlertSeverity.LOW:
        // Notificar apenas administradores para alertas de baixa prioridade
        users = await this.userRepository.find({
          where: { role: UserRole.ADMIN, isActive: true },
        });
        break;

      default:
        users = [];
    }

    return users;
  }

  private async sendBatchNotification(
    severity: AlertSeverity,
    alerts: Alert[],
  ): Promise<void> {
    try {
      const users = await this.getUsersForAlert({ severity } as Alert);
      const rule = this.notificationRules.find((r) => r.severity === severity);

      if (!rule || users.length === 0) return;

      // Criar mensagem de resumo
      const summaryMessage = this.createBatchSummaryMessage(severity, alerts);

      // Enviar por email (canal principal para lotes)
      const emailChannel = this.channels.get('email');
      if (emailChannel && emailChannel.enabled) {
        await emailChannel.send(summaryMessage as any, users);
      }

      this.logger.log(
        `Notificação em lote enviada: ${alerts.length} alertas (${severity})`,
      );
    } catch (error) {
      this.logger.error('Erro ao enviar notificação em lote:', error);
    }
  }

  private createBatchSummaryMessage(
    severity: AlertSeverity,
    alerts: Alert[],
  ): any {
    const alertTypes = alerts.reduce(
      (acc, alert) => {
        acc[alert.type] = (acc[alert.type] || 0) + 1;
        return acc;
      },
      {} as Record<string, number>,
    );

    return {
      id: `batch_${Date.now()}`,
      type: 'BATCH_SUMMARY',
      severity,
      title: `Resumo de Alertas - ${severity.toUpperCase()}`,
      message:
        `Foram detectados ${alerts.length} alertas de severidade ${severity} no período.\n\n` +
        `Tipos de alertas:\n${Object.entries(alertTypes)
          .map(([type, count]) => `- ${type}: ${count}`)
          .join('\n')}\n\n` +
        `Verifique o sistema para mais detalhes.`,
      metadata: {
        alertCount: alerts.length,
        alertTypes,
        period: {
          start: Math.min(...alerts.map((a) => a.createdAt.getTime())),
          end: Math.max(...alerts.map((a) => a.createdAt.getTime())),
        },
      },
    };
  }

  private initializeChannels(): void {
    // Canal de Email
    this.channels.set('email', {
      name: 'Email',
      enabled: this.configService.get('EMAIL_ENABLED', 'false') === 'true',
      send: async (alert: Alert, users: User[]) => {
        await this.sendEmailNotification(alert, users);
      },
    });

    // Canal SMS (simulado)
    this.channels.set('sms', {
      name: 'SMS',
      enabled: this.configService.get('SMS_ENABLED', 'false') === 'true',
      send: async (alert: Alert, users: User[]) => {
        await this.sendSmsNotification(alert, users);
      },
    });

    // Canal Push Notification (simulado)
    this.channels.set('push', {
      name: 'Push',
      enabled: this.configService.get('PUSH_ENABLED', 'false') === 'true',
      send: async (alert: Alert, users: User[]) => {
        await this.sendPushNotification(alert, users);
      },
    });

    // Canal Slack/Webhook (simulado)
    this.channels.set('slack', {
      name: 'Slack',
      enabled: this.configService.get('SLACK_ENABLED', 'false') === 'true',
      send: async (alert: Alert, users: User[]) => {
        await this.sendSlackNotification(alert);
      },
    });

    this.logger.log(
      `Canais de notificação inicializados: ${Array.from(this.channels.keys()).join(', ')}`,
    );
  }

  private async sendEmailNotification(
    alert: Alert,
    users: User[],
  ): Promise<void> {
    try {
      // Simulação de envio de email
      // Em produção, integrar com SendGrid, AWS SES, etc.

      const emailData = {
        to: users.map((u) => u.email),
        subject: `[${alert.severity.toUpperCase()}] ${alert.title}`,
        html: this.generateEmailTemplate(alert),
        text: this.generateEmailText(alert),
      };

      // Simular delay de envio
      await new Promise((resolve) => setTimeout(resolve, 100));

      this.logger.log(
        `Email enviado para ${users.length} usuários: ${alert.title}`,
      );
    } catch (error) {
      this.logger.error('Erro ao enviar email:', error);
      throw error;
    }
  }

  private async sendSmsNotification(
    alert: Alert,
    users: User[],
  ): Promise<void> {
    try {
      // Simulação de envio SMS
      // Em produção, integrar com Twilio, AWS SNS, etc.

      const smsData = {
        to: users.map((u) => u.email), // Usando email como placeholder para telefone
        message: this.generateSmsMessage(alert),
      };

      await new Promise((resolve) => setTimeout(resolve, 50));

      this.logger.log(`SMS enviado para ${users.length} usuários`);
    } catch (error) {
      this.logger.error('Erro ao enviar SMS:', error);
      throw error;
    }
  }

  private async sendPushNotification(
    alert: Alert,
    users: User[],
  ): Promise<void> {
    try {
      // Simulação de push notification
      // Em produção, integrar com Firebase, OneSignal, etc.

      const pushData = {
        to: users.map((u) => u.id), // IDs dos usuários
        title: alert.title,
        body: alert.message.substring(0, 100) + '...',
        data: {
          alertId: alert.id,
          type: alert.type,
          severity: alert.severity,
        },
      };

      await new Promise((resolve) => setTimeout(resolve, 30));

      this.logger.log(
        `Push notification enviado para ${users.length} usuários`,
      );
    } catch (error) {
      this.logger.error('Erro ao enviar push notification:', error);
      throw error;
    }
  }

  private async sendSlackNotification(alert: Alert): Promise<void> {
    try {
      // Simulação de envio para Slack
      // Em produção, integrar com Slack Webhooks

      const slackData = {
        text: `*${alert.severity.toUpperCase()}*: ${alert.title}`,
        blocks: [
          {
            type: 'section',
            text: {
              type: 'mrkdwn',
              text: `*${alert.title}*\n${alert.message}`,
            },
          },
          {
            type: 'section',
            fields: [
              { type: 'mrkdwn', text: `*Tipo:* ${alert.type}` },
              { type: 'mrkdwn', text: `*Severidade:* ${alert.severity}` },
              {
                type: 'mrkdwn',
                text: `*Tanque:* ${alert.tank?.name || 'N/A'}`,
              },
              {
                type: 'mrkdwn',
                text: `*Horário:* ${alert.createdAt.toISOString()}`,
              },
            ],
          },
        ],
      };

      await new Promise((resolve) => setTimeout(resolve, 20));

      this.logger.log('Notificação Slack enviada');
    } catch (error) {
      this.logger.error('Erro ao enviar notificação Slack:', error);
      throw error;
    }
  }

  private generateEmailTemplate(alert: Alert): string {
    return `
      <div style="font-family: Arial, sans-serif; max-width: 600px; margin: 0 auto;">
        <div style="background-color: ${this.getSeverityColor(alert.severity)}; color: white; padding: 20px; text-align: center;">
          <h1 style="margin: 0;">${alert.title}</h1>
          <p style="margin: 5px 0;">Severidade: ${alert.severity.toUpperCase()}</p>
        </div>

        <div style="padding: 20px; border: 1px solid #ddd; border-top: none;">
          <h2>Detalhes do Alerta</h2>
          <p><strong>Tipo:</strong> ${alert.type}</p>
          <p><strong>Mensagem:</strong> ${alert.message}</p>
          <p><strong>Tanque:</strong> ${alert.tank?.name || 'N/A'}</p>
          <p><strong>Sensor:</strong> ${alert.sensorId || 'N/A'}</p>
          <p><strong>Horário:</strong> ${alert.createdAt.toLocaleString('pt-BR')}</p>

          ${alert.currentLevel ? `<p><strong>Nível Atual:</strong> ${alert.currentLevel}m</p>` : ''}
          ${alert.currentVolume ? `<p><strong>Volume Atual:</strong> ${alert.currentVolume}L</p>` : ''}
          ${alert.thresholdValue ? `<p><strong>Limite:</strong> ${alert.thresholdValue}m</p>` : ''}

          <div style="margin-top: 30px; padding: 15px; background-color: #f8f9fa; border-radius: 5px;">
            <p style="margin: 0;"><strong>Ação Necessária:</strong></p>
            <p>Verifique o sistema e tome as medidas apropriadas para resolver este alerta.</p>
            <a href="${this.configService.get('FRONTEND_URL', 'http://localhost:3001')}/alerts/${alert.id}"
               style="display: inline-block; padding: 10px 20px; background-color: #007bff; color: white; text-decoration: none; border-radius: 5px; margin-top: 10px;">
              Ver Alerta no Sistema
            </a>
          </div>
        </div>

        <div style="text-align: center; padding: 20px; color: #666; border-top: 1px solid #ddd;">
          <p>Esta é uma notificação automática do Sistema Flowback IoT</p>
          <p>Não responda este email</p>
        </div>
      </div>
    `;
  }

  private generateEmailText(alert: Alert): string {
    return `
ALERTA - ${alert.severity.toUpperCase()}

${alert.title}

Tipo: ${alert.type}
Mensagem: ${alert.message}
Tanque: ${alert.tank?.name || 'N/A'}
Sensor: ${alert.sensorId || 'N/A'}
Horário: ${alert.createdAt.toLocaleString('pt-BR')}

${alert.currentLevel ? `Nível Atual: ${alert.currentLevel}m` : ''}
${alert.currentVolume ? `Volume Atual: ${alert.currentVolume}L` : ''}
${alert.thresholdValue ? `Limite: ${alert.thresholdValue}m` : ''}

Verifique o sistema para mais detalhes.
    `.trim();
  }

  private generateSmsMessage(alert: Alert): string {
    const maxLength = 140;
    let message = `${alert.severity.toUpperCase()}: ${alert.title}`;

    if (alert.tank?.name) {
      message += ` - ${alert.tank.name}`;
    }

    // Limitar tamanho da mensagem
    if (message.length > maxLength) {
      message = message.substring(0, maxLength - 3) + '...';
    }

    return message;
  }

  private getSeverityColor(severity: AlertSeverity): string {
    switch (severity) {
      case AlertSeverity.CRITICAL:
        return '#dc3545';
      case AlertSeverity.HIGH:
        return '#fd7e14';
      case AlertSeverity.MEDIUM:
        return '#ffc107';
      case AlertSeverity.LOW:
        return '#28a745';
      default:
        return '#6c757d';
    }
  }

  // Método para testar canais de notificação
  async testChannel(channelName: string): Promise<boolean> {
    const channel = this.channels.get(channelName);

    if (!channel) {
      throw new Error(`Canal ${channelName} não encontrado`);
    }

    if (!channel.enabled) {
      return false;
    }

    try {
      // Criar alerta de teste
      const testAlert = {
        id: 'test',
        type: AlertType.SENSOR_OFFLINE,
        severity: AlertSeverity.LOW,
        title: 'Teste de Notificação',
        message: 'Esta é uma notificação de teste',
        createdAt: new Date(),
      } as Alert;

      // Buscar usuário admin para teste
      const adminUser = await this.userRepository.findOne({
        where: { role: UserRole.ADMIN, isActive: true },
      });

      if (adminUser) {
        await channel.send(testAlert, [adminUser]);
        return true;
      }

      return false;
    } catch (error) {
      this.logger.error(`Erro ao testar canal ${channelName}:`, error);
      return false;
    }
  }

  // Método para obter status dos canais
  getChannelStatus(): any {
    const status = {};

    this.channels.forEach((channel, name) => {
      status[name] = {
        enabled: channel.enabled,
        name: channel.name,
      };
    });

    return status;
  }

  // Método para configurar regras de notificação
  setNotificationRules(rules: NotificationRule[]): void {
    this.notificationRules = rules;
    this.logger.log(
      `Regras de notificação atualizadas: ${rules.length} regras`,
    );
  }
}
