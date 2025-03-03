import * as PDFJS from 'pdfjs-dist';
import {
  PDFViewer as PdfJsPDFViewer,
  EventBus,
  PDFLinkService,
  LinkTarget,
} from 'pdfjs-dist/web/pdf_viewer.mjs';

export class PDFJSWrapper {
  public readonly viewer: PdfJsPDFViewer;
  public readonly eventBus: EventBus;
  private readonly linkService: PDFLinkService;
  private url?: string;

  constructor(container: HTMLDivElement) {
    this.eventBus = new EventBus();

    this.linkService = new PDFLinkService({
      eventBus: this.eventBus,
      externalLinkTarget: LinkTarget.BLANK,
      externalLinkRel: 'noopener',
    });

    this.viewer = new PdfJsPDFViewer({
      container,
      eventBus: this.eventBus,
      linkService: this.linkService,
      annotationMode: PDFJS.AnnotationMode.ENABLE,
      annotationEditorMode: PDFJS.AnnotationEditorType.DISABLE,
    });

    this.linkService.setViewer(this.viewer);
  }

  async loadDocument(url: string) {
    this.url = url;

    try {
      const doc = await PDFJS.getDocument({
        url,
        disableFontFace: true,
        disableAutoFetch: true,
        disableStream: true,
        isEvalSupported: false,
        enableXfa: false,
      }).promise;

      if (url !== this.url) {
        return;
      }

      this.viewer.setDocument(doc);
      this.linkService.setDocument(doc);

      return doc;
    } catch (error: any) {
      console.error('Error loading PDF:', error);
      throw error;
    }
  }

  updateOnResize() {
    if (!this.isVisible()) {
      return;
    }
    window.requestAnimationFrame(() => {
      const currentScaleValue = this.viewer.currentScaleValue;
      if (
        currentScaleValue === 'auto' ||
        currentScaleValue === 'page-fit' ||
        currentScaleValue === 'page-height' ||
        currentScaleValue === 'page-width'
      ) {
        this.viewer.currentScaleValue = currentScaleValue;
      }

      this.viewer.update();
    });
  }

  isVisible() {
    return this.viewer.container.offsetParent !== null;
  }

  get currentPosition() {
    if (!this.viewer.pdfDocument) return undefined;

    const pageIndex = this.viewer.currentPageNumber - 1;
    const pageView = this.viewer.getPageView(pageIndex);

    if (!pageView) return undefined;

    const pageRect = pageView.div.getBoundingClientRect();
    const containerRect = this.viewer.container.getBoundingClientRect();
    const dy = containerRect.top - pageRect.top;
    const dx = containerRect.left - pageRect.left;
    const [left, top] = pageView.viewport.convertToPdfPoint(dx, dy);
    const [, , width, height] = pageView.viewport.viewBox;

    return {
      page: pageIndex,
      offset: { top, left },
      pageSize: { height, width },
    };
  }
}
