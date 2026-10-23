// Nur für die Typdeklarationen von dist/: die Visual-Klassen sind nicht Teil der öffentlichen API.
export declare class Visual {
    constructor(options: { element: HTMLElement; host: unknown });
    update(options: unknown): void;
    destroy?(): void;
}
