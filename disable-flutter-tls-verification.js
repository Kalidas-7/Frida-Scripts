var TLSValidationDisabled = false;
var secondRun = false;
if (Java.available) {
    console.log("[+] Java environment detected");
    Java.perform(hookSystemLoadLibrary);
    disableTLSValidationAndroid();
    setTimeout(disableTLSValidationAndroid, 1000);
} else if (ObjC.available) {
    console.log("[+] iOS environment detected");
    disableTLSValidationiOS();
    setTimeout(disableTLSValidationiOS, 1000);
}
 
function hookSystemLoadLibrary() {
    const System = Java.use('java.lang.System');
    const Runtime = Java.use('java.lang.Runtime');
    const SystemLoad_2 = System.loadLibrary.overload('java.lang.String');
    const VMStack = Java.use('dalvik.system.VMStack');
 
    SystemLoad_2.implementation = function(library) {
        try {
            const loaded = Runtime.getRuntime().loadLibrary0(VMStack.getCallingClassLoader(), library);
            if (library === 'flutter') {
                console.log("[+] libflutter.so loaded");
                disableTLSValidationAndroid();
            }
            return loaded;
        } catch (ex) {
            console.log(ex);
        }
    };
}
 
function disableTLSValidationiOS() {
    if (TLSValidationDisabled) return;
 
    var m = Process.findModuleByName("Flutter");
 
    // If there is no loaded Flutter module, the setTimeout may trigger a second time, but after that we give up
    if (m === null) {
        if (secondRun) console.log("[!] Flutter module not found.");
        secondRun = true;
        return;
    }
 
    var patterns = {
        "arm64": [
            "FF 83 01 D1 FA 67 01 A9 F8 5F 02 A9 F6 57 03 A9 F4 4F 04 A9 FD 7B 05 A9 FD 43 01 91 F? 03 00 AA 1? 00 40 F9 ?8 1A 40 F9 15 ?5 4? F9 B5 00 00 B4 "
        ],
    };
    findAndPatch(m, patterns[Process.arch], 0);
 
}
 
function disableTLSValidationAndroid() {
    if (TLSValidationDisabled) return;
 
    var m = Process.findModuleByName("libflutter.so");
 
    // The System.loadLibrary doesn't always trigger, or sometimes the library isn't fully loaded yet, so this is a backup
    if (m === null) {
        if (secondRun) console.log("[!] Flutter module not found.");
        secondRun = true;
        return;
    }
 
    var patterns = {
        "arm64": [
            "F? 0F 1C F8 F? 5? 01 A9 F? 5? 02 A9 F? ?? 03 A9 ?? ?? ?? ?? 68 1A 40 F9",
        ],
        "arm": [
            "2D E9 FE 43 D0 F8 00 80 81 46 D8 F8 18 00 D0 F8 ?? 71"
        ]
    };
    findAndPatch(m, patterns[Process.arch], Process.arch == "arm" ? 1 : 0);
}
 
function findAndPatch(m, patterns, thumb) {
    console.log("[+] Flutter library found");
    var ranges = m.enumerateRanges('r-x');
    ranges.forEach(range => {
        patterns.forEach(pattern => {
            Memory.scan(range.base, range.size, pattern, {
                onMatch: function(address, size) {
                    console.log('[+] ssl_verify_peer_cert found at offset: 0x' + (address - m.base).toString(16));
                    TLSValidationDisabled = true;
                    hook_ssl_verify_peer_cert(address.add(thumb));
                }
            });
        });
    });
 
    if (!TLSValidationDisabled) {
        if (secondRun)
            console.log('[!] ssl_verify_peer_cert not found. Please open an issue at https://github.com/NVISOsecurity/disable-flutter-tls-verification/issues');
        else
            console.log('[!] ssl_verify_peer_cert not found. Trying again...');
    }
    secondRun = true;
}
 
function hook_ssl_verify_peer_cert(address) {
    Interceptor.replace(address, new NativeCallback((pathPtr, flags) => {
        return 0;
    }, 'int', ['pointer', 'int']));
}
