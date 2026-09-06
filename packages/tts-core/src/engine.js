const engines = new Map();
let activeEngineId = null;
/** 注册引擎；同 id 重复注册直接覆盖（以后注册者为准）。 */
export function registerTtsEngine(engine) {
    engines.set(engine.id, engine);
    if (activeEngineId === null)
        activeEngineId = engine.id;
}
export function setActiveTtsEngine(id) {
    if (!engines.has(id))
        return false;
    activeEngineId = id;
    return true;
}
export function getActiveTtsEngine() {
    if (!activeEngineId)
        return undefined;
    return engines.get(activeEngineId);
}
export function listTtsEngines() {
    return [...engines.values()];
}
/** 仅供单测隔离（生产代码禁止调用）。 */
export function __resetTtsEnginesForTest() {
    engines.clear();
    activeEngineId = null;
}
//# sourceMappingURL=engine.js.map