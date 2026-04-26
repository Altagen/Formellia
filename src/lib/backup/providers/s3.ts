import {
  S3Client,
  PutObjectCommand,
  GetObjectCommand,
  ListObjectsV2Command,
  DeleteObjectCommand,
  HeadBucketCommand,
} from "@aws-sdk/client-s3";
import type { BackupListEntry, BackupProvider, S3ProviderConfig } from "../types";

export class S3Provider implements BackupProvider {
  private client: S3Client;
  private bucket: string;
  private prefix: string;

  constructor(config: S3ProviderConfig) {
    this.bucket = config.bucket;
    this.prefix = config.prefix ? config.prefix.replace(/\/$/, "") + "/" : "";

    this.client = new S3Client({
      endpoint:        config.endpoint,
      region:          config.region,
      forcePathStyle:  config.forcePathStyle ?? false,
      credentials: {
        accessKeyId:     config.accessKeyId,
        secretAccessKey: config.secretAccessKey,
      },
    });
  }

  private fullKey(key: string): string {
    return this.prefix + key;
  }

  async upload(key: string, data: Buffer): Promise<void> {
    await this.client.send(new PutObjectCommand({
      Bucket:      this.bucket,
      Key:         this.fullKey(key),
      Body:        data,
      ContentType: "application/zip",
    }));
  }

  async download(key: string): Promise<Buffer> {
    const res = await this.client.send(new GetObjectCommand({
      Bucket: this.bucket,
      Key:    this.fullKey(key),
    }));

    if (!res.Body) throw new Error("Empty response body from S3");

    // Consume the stream into a Buffer
    const chunks: Uint8Array[] = [];
    for await (const chunk of res.Body as AsyncIterable<Uint8Array>) {
      chunks.push(chunk);
    }
    return Buffer.concat(chunks);
  }

  async list(): Promise<BackupListEntry[]> {
    const results: BackupListEntry[] = [];
    let continuationToken: string | undefined;

    do {
      const res = await this.client.send(new ListObjectsV2Command({
        Bucket:            this.bucket,
        Prefix:            this.prefix,
        ContinuationToken: continuationToken,
      }));

      for (const obj of res.Contents ?? []) {
        if (!obj.Key?.endsWith(".zip")) continue;
        const shortKey = obj.Key.slice(this.prefix.length);
        results.push({
          key:       shortKey,
          filename:  shortKey,
          size:      obj.Size ?? 0,
          createdAt: obj.LastModified ?? new Date(0),
        });
      }

      continuationToken = res.IsTruncated ? res.NextContinuationToken : undefined;
    } while (continuationToken);

    return results.sort((a, b) => b.createdAt.getTime() - a.createdAt.getTime());
  }

  async delete(key: string): Promise<void> {
    await this.client.send(new DeleteObjectCommand({
      Bucket: this.bucket,
      Key:    this.fullKey(key),
    }));
  }

  async testConnection(): Promise<void> {
    await this.client.send(new HeadBucketCommand({ Bucket: this.bucket }));
  }
}
