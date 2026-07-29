import { DocumentBuilder, SwaggerModule } from '@nestjs/swagger';
import type { INestApplication } from '@nestjs/common';

/** OpenAPI ドキュメントを `/api/docs` に公開 */
export function setupSwagger(app: INestApplication): void {
  const config = new DocumentBuilder()
    .setTitle('MHI 進捗管理支援 API')
    .setDescription('部品進捗・マスタ・ETL・認証の REST API')
    .setVersion('0.1.0')
    .addCookieAuth('mhi_token')
    .build();
  const document = SwaggerModule.createDocument(app, config);
  SwaggerModule.setup('api/docs', app, document);
}
