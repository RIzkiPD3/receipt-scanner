import { Test, TestingModule } from '@nestjs/testing';
import { INestApplication } from '@nestjs/common';
import request from 'supertest';
import { AppModule } from './../src/app.module';
import { PrismaService } from '../src/database/prisma.service';
import { WhatsAppGraphClient } from '../src/modules/whatsapp/client/whatsapp-graph.client';
import { WorkerClient } from '../src/modules/worker/client/worker.client';
import { StorageProvider } from '../src/modules/storage/interfaces/storage-provider.interface';
import { STORAGE_PROVIDER } from '../src/modules/storage/storage.constants';
import { PdfService } from '../src/modules/pdf/services/pdf.service';
import * as fs from 'fs';
import * as path from 'path';

// =============================================================================
// Receipt Scanner — End-to-End Integration Tests
// =============================================================================
// Menguji alur lengkap sistem secara penuh menggunakan DB simulator in-memory:
//   1. User kirim struk belanja via WhatsApp
//   2. Webhook menerima event image -> download media -> simpan PENDING -> kirim ke Go worker
//   3. Go worker memproses (disimulasikan dengan POST /api/receipts)
//   4. Backend menyimpan data terstruktur -> generate Invoice -> kirim tombol interaktif
//   5. User klik tombol "Buatkan PDF" -> webhook menerima button click
//   6. Backend generate PDF -> simpan ke disk -> kirim dokumen PDF -> update pdfUrl di DB
// =============================================================================

describe('Receipt Scanner System (e2e)', () => {
  let app: INestApplication;
  let mockGraphClient: any;
  let mockWorkerClient: any;
  let mockStorageProvider: any;

  // Database simulator in-memory untuk memverifikasi query & mutasi
  const db = {
    users: [] as any[],
    receipts: [] as any[],
    receiptItems: [] as any[],
    invoices: [] as any[],
    invoiceItems: [] as any[],
  };

  const mockPrisma = {
    user: {
      findUnique: jest.fn().mockImplementation((args) => {
        if (args.where.id) {
          return db.users.find((u) => u.id === args.where.id) || null;
        }
        if (args.where.phoneNumber) {
          return (
            db.users.find((u) => u.phoneNumber === args.where.phoneNumber) ||
            null
          );
        }
        return null;
      }),
      create: jest.fn().mockImplementation((args) => {
        const u = { id: `user-id-${Date.now()}`, ...args.data };
        db.users.push(u);
        return u;
      }),
      deleteMany: jest.fn().mockImplementation(() => {
        db.users = [];
        return { count: 0 };
      }),
    },
    receipt: {
      create: jest.fn().mockImplementation((args) => {
        const r = {
          id: `receipt-id-${Date.now()}`,
          status: 'PENDING',
          createdAt: new Date(),
          ...args.data,
        };
        db.receipts.push(r);
        return r;
      }),
      findUnique: jest.fn().mockImplementation((args) => {
        const r = db.receipts.find((item) => item.id === args.where.id);
        if (r && args.include?.items) {
          return {
            ...r,
            items: db.receiptItems.filter((i) => i.receiptId === r.id),
          };
        }
        return r || null;
      }),
      findUniqueOrThrow: jest.fn().mockImplementation((args) => {
        const r = db.receipts.find((item) => item.id === args.where.id);
        if (!r) throw new Error('Not found');
        if (args.include?.items) {
          return {
            ...r,
            items: db.receiptItems.filter((i) => i.receiptId === r.id),
          };
        }
        return r;
      }),
      findFirst: jest.fn().mockImplementation((args) => {
        if (args.where?.userId) {
          return (
            db.receipts.find((r) => r.userId === args.where.userId) || null
          );
        }
        return db.receipts[0] || null;
      }),
      update: jest.fn().mockImplementation((args) => {
        const r = db.receipts.find((item) => item.id === args.where.id);
        if (r) {
          Object.assign(r, args.data);
        }
        return r;
      }),
      deleteMany: jest.fn().mockImplementation(() => {
        db.receipts = [];
        return { count: 0 };
      }),
    },
    receiptItem: {
      createMany: jest.fn().mockImplementation((args) => {
        args.data.forEach((item: any) => {
          db.receiptItems.push({ id: `ri-${Date.now()}`, ...item });
        });
        return { count: args.data.length };
      }),
      deleteMany: jest.fn().mockImplementation(() => {
        db.receiptItems = [];
        return { count: 0 };
      }),
    },
    invoice: {
      create: jest.fn().mockImplementation((args) => {
        const inv = { id: `inv-id-${Date.now()}`, ...args.data };
        db.invoices.push(inv);
        return inv;
      }),
      findUnique: jest.fn().mockImplementation((args) => {
        return (
          db.invoices.find(
            (i) =>
              i.id === args.where.id ||
              i.invoiceNumber === args.where.invoiceNumber,
          ) || null
        );
      }),
      findUniqueOrThrow: jest.fn().mockImplementation((args) => {
        const inv = db.invoices.find((i) => i.id === args.where.id);
        if (!inv) throw new Error('Not found');
        return {
          ...inv,
          items: db.invoiceItems.filter((item) => item.invoiceId === inv.id),
        };
      }),
      findFirst: jest.fn().mockImplementation((args) => {
        return db.invoices[0] || null;
      }),
      update: jest.fn().mockImplementation((args) => {
        const inv = db.invoices.find((i) => i.id === args.where.id);
        if (inv) {
          Object.assign(inv, args.data);
        }
        return inv;
      }),
      deleteMany: jest.fn().mockImplementation(() => {
        db.invoices = [];
        return { count: 0 };
      }),
    },
    invoiceItem: {
      createMany: jest.fn().mockImplementation((args) => {
        args.data.forEach((item: any) => {
          db.invoiceItems.push({ id: `ii-${Date.now()}`, ...item });
        });
        return { count: args.data.length };
      }),
      deleteMany: jest.fn().mockImplementation(() => {
        db.invoiceItems = [];
        return { count: 0 };
      }),
    },
    $transaction: jest.fn().mockImplementation(async (callback) => {
      return callback(mockPrisma);
    }),
    $executeRawUnsafe: jest.fn().mockResolvedValue(1),
    $queryRawUnsafe: jest.fn().mockResolvedValue([{ '?column?': 1 }]),
  };

  // Cleanup temporary PDFs created during test
  const storageDir = path.join(process.cwd(), 'storage/pdf');

  beforeAll(async () => {
    mockGraphClient = {
      sendInteractiveButtonMessage: jest.fn().mockResolvedValue(undefined),
      sendTextMessage: jest.fn().mockResolvedValue(undefined),
      uploadMedia: jest.fn().mockResolvedValue('meta-media-id-999'),
      sendDocumentMessage: jest.fn().mockResolvedValue(undefined),
      getMediaMetadata: jest.fn().mockResolvedValue({
        url: 'http://meta-cdn/media-123',
        mime_type: 'image/jpeg',
        file_size: 1024,
        id: 'media-123',
      }),
      downloadMediaStream: jest.fn().mockResolvedValue(new ArrayBuffer(8)),
    };

    mockWorkerClient = {
      sendToWorker: jest.fn().mockResolvedValue({
        status: 'success',
        message: 'Processing started on worker',
      }),
    };

    mockStorageProvider = {
      upload: jest.fn().mockResolvedValue('temp/uploads/media-123.jpg'),
      delete: jest.fn().mockResolvedValue(undefined),
      getPublicUrl: jest
        .fn()
        .mockReturnValue('http://test-server/uploads/media-123.jpg'),
    };

    const mockPdfService = {
      generateInvoicePdf: jest.fn().mockImplementation(async (invoice) => {
        if (!fs.existsSync(storageDir)) {
          fs.mkdirSync(storageDir, { recursive: true });
        }
        const pdfPath = path.join(storageDir, `${invoice.invoiceNumber}.pdf`);
        const pdfBuffer = Buffer.from('%PDF-mock-e2e');
        fs.writeFileSync(pdfPath, pdfBuffer);
        return { pdfPath, pdfBuffer };
      }),
    };

    const moduleFixture: TestingModule = await Test.createTestingModule({
      imports: [AppModule],
    })
      .overrideProvider(PrismaService)
      .useValue(mockPrisma)
      .overrideProvider(WhatsAppGraphClient)
      .useValue(mockGraphClient)
      .overrideProvider(WorkerClient)
      .useValue(mockWorkerClient)
      .overrideProvider(STORAGE_PROVIDER)
      .useValue(mockStorageProvider)
      .overrideProvider(PdfService)
      .useValue(mockPdfService)
      .compile();

    app = moduleFixture.createNestApplication();
    await app.init();
  });

  afterAll(async () => {
    // Reset database simulator
    db.users = [];
    db.receipts = [];
    db.receiptItems = [];
    db.invoices = [];
    db.invoiceItems = [];

    await app.close();

    // Hapus file E2E PDF jika terbuat
    const testPdfPath = path.join(storageDir, 'INV-E2E-TEST.pdf');
    if (fs.existsSync(testPdfPath)) {
      fs.unlinkSync(testPdfPath);
    }
  });

  it('harus mengeksekusi pipeline lengkap secara terintegrasi', async () => {
    const userPhone = '628999999999';

    // -------------------------------------------------------------------------
    // KELOMPOK 1: Menerima Gambar Struk (WhatsApp Webhook)
    // -------------------------------------------------------------------------
    const webhookImagePayload = {
      object: 'whatsapp_business_account',
      entry: [
        {
          id: 'wa-business-account-id',
          changes: [
            {
              value: {
                messaging_product: 'whatsapp',
                metadata: {
                  display_phone_number: '12345',
                  phone_number_id: '12345',
                },
                contacts: [
                  { profile: { name: 'E2E Tester' }, wa_id: userPhone },
                ],
                messages: [
                  {
                    from: userPhone,
                    id: 'wamid.HBgLTYyODEyMzQ1Njc4OQ==',
                    timestamp: '1720235000',
                    type: 'image',
                    image: {
                      id: 'media-123',
                      mime_type: 'image/jpeg',
                      sha256: 'sha256-hash',
                    },
                  },
                ],
              },
              field: 'messages',
            },
          ],
        },
      ],
    };

    // Trigger webhook penerimaan gambar
    await request(app.getHttpServer())
      .post('/webhook')
      .send(webhookImagePayload)
      .expect(200);

    // Tunggu scheduler mikro untuk menyelesaikan proses download media & simpan PENDING asinkron
    await new Promise((resolve) => setTimeout(resolve, 100));

    // Verifikasi user terbuat di database
    const user = db.users.find((u) => u.phoneNumber === userPhone);
    expect(user).toBeDefined();
    expect(user?.phoneNumber).toBe(userPhone);

    // Verifikasi Receipt dengan status PENDING terbuat
    const pendingReceipt = db.receipts.find((r) => r.userId === user?.id);
    expect(pendingReceipt).toBeDefined();
    expect(pendingReceipt?.status).toBe('PENDING');
    expect(pendingReceipt?.whatsappMediaId).toBe('media-123');

    // Verifikasi worker dipanggil
    expect(mockWorkerClient.sendToWorker).toHaveBeenCalledWith(
      pendingReceipt?.id,
      expect.stringContaining('media-123'),
    );

    // -------------------------------------------------------------------------
    // KELOMPOK 2: Go Worker Callback (Simulasi POST /api/receipts)
    // -------------------------------------------------------------------------
    const workerCallbackPayload = {
      receiptId: pendingReceipt?.id,
      storeName: 'E2E Supermarket',
      transactionDate: '2026-07-06T12:00:00Z',
      subtotal: 45000,
      tax: 4500,
      total: 49500,
      items: [
        {
          name: 'Susu UHT 1L',
          quantity: 2,
          unitPrice: 15000,
          totalPrice: 30000,
        },
        {
          name: 'Kopi Kapal Api',
          quantity: 1,
          unitPrice: 15000,
          totalPrice: 15000,
        },
      ],
      imageUrl: pendingReceipt?.imageUrl,
    };

    // Kirim callback dari worker ke backend
    const callbackRes = await request(app.getHttpServer())
      .post('/receipts')
      .send(workerCallbackPayload)
      .expect(201);

    expect(callbackRes.body.status).toBe('PROCESSED');
    expect(callbackRes.body.merchantName).toBe('E2E Supermarket');

    // Tunggu scheduler mikro untuk memproses generate invoice asinkron
    await new Promise((resolve) => setTimeout(resolve, 100));

    // Verifikasi Receipt diperbarui ke PROCESSED
    const processedReceipt = db.receipts.find(
      (item) => item.id === pendingReceipt?.id,
    );
    expect(processedReceipt?.status).toBe('PROCESSED');
    expect(db.receiptItems.length).toBe(2);

    // Verifikasi Invoice berhasil dibuat
    const invoice = db.invoices.find((i) => i.receiptId === pendingReceipt?.id);
    expect(invoice).toBeDefined();
    expect(invoice?.merchantName).toBe('E2E Supermarket');
    expect(Number(invoice?.totalAmount)).toBe(49500);

    // Verifikasi notifikasi WhatsApp terkirim ke user dengan tombol interaktif
    expect(mockGraphClient.sendInteractiveButtonMessage).toHaveBeenCalledWith(
      userPhone,
      expect.stringContaining('E2E Supermarket'),
      expect.arrayContaining([
        expect.objectContaining({
          id: `pdf_req:${invoice?.invoiceNumber}`,
        }),
      ]),
    );

    // Override local invoice number so the PDF is saved using a test name
    // (mocking the generator to use the same invoice number)
    invoice.invoiceNumber = 'INV-E2E-TEST';

    // -------------------------------------------------------------------------
    // KELOMPOK 3: Klik Tombol PDF (WhatsApp Webhook Callback)
    // -------------------------------------------------------------------------
    const webhookButtonPayload = {
      object: 'whatsapp_business_account',
      entry: [
        {
          id: 'wa-business-account-id',
          changes: [
            {
              value: {
                messaging_product: 'whatsapp',
                metadata: {
                  display_phone_number: '12345',
                  phone_number_id: '12345',
                },
                contacts: [
                  { profile: { name: 'E2E Tester' }, wa_id: userPhone },
                ],
                messages: [
                  {
                    from: userPhone,
                    id: 'wamid.HBgLTYyODEyMzQ1Njc4Xw==',
                    timestamp: '1720236000',
                    type: 'interactive',
                    interactive: {
                      type: 'button_reply',
                      button_reply: {
                        id: `pdf_req:${invoice?.invoiceNumber}`,
                        title: '📄 Buatkan PDF',
                      },
                    },
                  },
                ],
              },
              field: 'messages',
            },
          ],
        },
      ],
    };

    // Trigger webhook ketika tombol diklik
    await request(app.getHttpServer())
      .post('/webhook')
      .send(webhookButtonPayload)
      .expect(200);

    // Tunggu scheduler mikro untuk memproses generate PDF
    await new Promise((resolve) => setTimeout(resolve, 500));

    // Verifikasi file PDF benar-benar terbuat secara lokal di disk
    const expectedPdfPath = path.join(storageDir, 'INV-E2E-TEST.pdf');
    const pdfExists = fs.existsSync(expectedPdfPath);
    expect(pdfExists).toBe(true);

    // Verifikasi media PDF diunggah ke Meta Graph API
    expect(mockGraphClient.uploadMedia).toHaveBeenCalledWith(
      expect.any(Buffer),
      'INV-E2E-TEST.pdf',
      'application/pdf',
    );

    // Verifikasi pesan dokumen PDF terkirim ke WhatsApp user
    expect(mockGraphClient.sendDocumentMessage).toHaveBeenCalledWith(
      userPhone,
      'meta-media-id-999',
      'INV-E2E-TEST.pdf',
      expect.stringContaining('Invoice'),
    );

    // Verifikasi path lokal PDF disimpan ke kolom pdfUrl di DB
    const updatedInvoice = db.invoices.find((i) => i.id === invoice?.id);
    expect(updatedInvoice?.pdfUrl).toContain('INV-E2E-TEST.pdf');
  });
});
