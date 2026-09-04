#!/usr/bin/env python3
"""Metti un'istanza di fee[dB]ack nelle condizioni in cui la vedranno gli altri.

PERCHE' ESISTE. Provare i propri plugin dentro un'app che porta anche le
proprie correzioni non e' provarli: e' provare una combinazione che nessun
altro avra'. La correzione del doppio audio nel drill, per dire, vive in
`notedetect` e non e' rilasciata — con quella dentro il drill funziona qui e
non funziona da nessun'altra parte.

Quindi due stati, espliciti e reversibili:

  native   i plugin dal loro repo, i file dell'app come li ha ricevuti
           l'installazione. E' quello che vedra' chi installa i plugin.
  patched  come sopra, piu' i commit locali su app e rilevatore. Comodo per
           lavorare, inutile per giudicare.

GENERICO PER COSTRUZIONE. Non sa i nomi dei plugin: legge `plugin.json` di
ogni repo che gli passi (o che trova accanto a se') e ne ricava l'id, quindi
un plugin nuovo domani non richiede di toccare questo file. Gli unici nomi
cablati sono i due file dell'app che una patch locale puo' toccare, elencati
in APP_PATCHABLE, ed e' cablato quello che deve esserlo: sono un fatto
dell'app, non una scelta.

    python tools/stage-instance.py --check
    python tools/stage-instance.py --app native
    python tools/stage-instance.py --app patched
"""

import argparse
import io
import json
import os
import subprocess
import sys
import tarfile

# L'istanza di riferimento. Sovrascrivibile con --instance: un percorso
# cablato in uno strumento e' un percorso che vale per una macchina sola.
DEFAULT_INSTANCE = os.path.join(
    os.path.expanduser('~'), 'Desktop', 'Feedback', 'resources', 'slopsmith')

# I repo dell'app e del rilevatore: quelli che una patch locale tocca.
# `stock` e' il riferimento dello stato di serie — per il rilevatore e' il
# commit prima delle correzioni locali, che e' anche il suo `origin/main`.
APP_PATCHABLE = [
    # (repo, file nel repo, file nell'istanza, ref di serie)
    ('feedBack', 'static/app.js', 'static/app.js', 'origin/main'),
    ('feedBack/plugins/notedetect', 'screen.js',
     'plugins/notedetect/screen.js', 'origin/main'),
]


def git(repo, *args):
    out = subprocess.run(['git', '-C', repo, *args],
                         capture_output=True, check=False)
    if out.returncode != 0:
        raise RuntimeError('git %s in %s: %s'
                           % (' '.join(args), repo, out.stderr.decode('utf-8', 'replace').strip()))
    return out.stdout


def git_text(repo, *args):
    return git(repo, *args).decode('utf-8', 'replace').strip()


def plugin_id(repo):
    """L'id con cui l'app conosce il plugin, dal suo stesso manifest."""
    with io.open(os.path.join(repo, 'plugin.json'), encoding='utf-8') as fh:
        return json.load(fh)['id']


def plugin_version(repo):
    with io.open(os.path.join(repo, 'plugin.json'), encoding='utf-8') as fh:
        return json.load(fh).get('version', '?')


def find_plugin_repos(here):
    """I repo plugin accanto a questo, cioe' i fratelli `feedBack-plugin-*`.

    Scoperti invece che elencati: aggiungere un plugin non deve voler dire
    modificare lo strumento che lo installa.
    """
    parent = os.path.dirname(here)
    found = []
    for name in sorted(os.listdir(parent)):
        path = os.path.join(parent, name)
        if not name.startswith('feedBack-plugin-'):
            continue
        if not os.path.isfile(os.path.join(path, 'plugin.json')):
            continue          # il kit non e' un plugin: non ha manifest
        found.append(path)
    return found


def stage_plugin(repo, instance):
    """L'albero COMMITTATO nella cartella del plugin dentro l'istanza.

    `git archive` e non una copia della cartella: copia esattamente i file
    versionati e nessun file di scarto — niente `node_modules`, niente
    scratch, niente `.git`. Quello che finisce nell'istanza e' quello che
    finirebbe in un pacchetto.
    """
    pid = plugin_id(repo)
    dest = os.path.join(instance, 'plugins', pid)
    if not os.path.isdir(dest):
        return (pid, None, 'la cartella non esiste nell\'istanza: %s' % dest)
    blob = git(repo, 'archive', '--format=tar', 'HEAD')
    with tarfile.open(fileobj=io.BytesIO(blob)) as tar:
        tar.extractall(dest)
    return (pid, plugin_version(repo), None)


def app_repos(dev_root):
    for rel, src, dst, stock in APP_PATCHABLE:
        yield os.path.join(dev_root, rel), src, dst, stock


def set_app(dev_root, instance, mode):
    """`native`: i file dell'app come li ha ricevuti l'installazione.
    `patched`: con i commit locali."""
    done = []
    for repo, src, dst, stock in app_repos(dev_root):
        ref = 'HEAD' if mode == 'patched' else stock
        try:
            blob = git(repo, 'show', '%s:%s' % (ref, src))
        except RuntimeError as err:
            done.append((dst, 'salto: %s' % err))
            continue
        target = os.path.join(instance, dst)
        if not os.path.isdir(os.path.dirname(target)):
            done.append((dst, 'salto: manca %s' % os.path.dirname(target)))
            continue
        # I file dell'istanza hanno fine riga CRLF: li mantengo, o ogni
        # confronto futuro segnalerebbe una differenza che non c'e'.
        text = blob.decode('utf-8').replace('\r\n', '\n').replace('\n', '\r\n')
        with io.open(target, 'w', encoding='utf-8', newline='') as fh:
            fh.write(text)
        done.append((dst, '%s @ %s' % (mode, git_text(repo, 'rev-parse', '--short', ref))))
    return done


def check(dev_root, instance, repos):
    print('istanza: %s' % instance)
    print('')
    print('plugin installati:')
    for repo in repos:
        pid = plugin_id(repo)
        dest = os.path.join(instance, 'plugins', pid)
        head = git_text(repo, 'rev-parse', '--short', 'HEAD')
        if not os.path.isdir(dest):
            print('  %-14s ASSENTE nell\'istanza' % pid)
            continue
        try:
            with io.open(os.path.join(dest, 'plugin.json'), encoding='utf-8') as fh:
                inst_v = json.load(fh).get('version', '?')
        except OSError:
            inst_v = '?'
        # Allineato al repo? Confronto i file versionati, ignorando i fine riga.
        names = git_text(repo, 'ls-files').splitlines()
        drift = []
        for name in names:
            a = os.path.join(dest, name)
            if not os.path.isfile(a):
                drift.append(name)
                continue
            with io.open(a, 'rb') as fh:
                got = fh.read().replace(b'\r\n', b'\n')
            want = git(repo, 'show', 'HEAD:%s' % name).replace(b'\r\n', b'\n')
            if got != want:
                drift.append(name)
        state = 'allineato a %s' % head if not drift else '%d file diversi da %s' % (len(drift), head)
        print('  %-14s %-9s %s' % (pid, inst_v, state))
        for name in drift[:4]:
            print('                            · %s' % name)

    print('')
    print('file dell\'app (quelli che una patch locale tocca):')
    for repo, src, dst, stock in app_repos(dev_root):
        target = os.path.join(instance, dst)
        if not os.path.isfile(target):
            print('  %-34s assente' % dst)
            continue
        with io.open(target, 'rb') as fh:
            got = fh.read().replace(b'\r\n', b'\n')
        verdict = 'non corrisponde a nessuno dei due'
        for label, ref in (('native', stock), ('patched', 'HEAD')):
            try:
                want = git(repo, 'show', '%s:%s' % (ref, src)).replace(b'\r\n', b'\n')
            except RuntimeError:
                continue
            if got == want:
                verdict = '%s (%s)' % (label, git_text(repo, 'rev-parse', '--short', ref))
                break
        print('  %-34s %s' % (dst, verdict))


def main():
    here = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
    ap = argparse.ArgumentParser(description=__doc__,
                                 formatter_class=argparse.RawDescriptionHelpFormatter)
    ap.add_argument('--instance', default=DEFAULT_INSTANCE,
                    help='la cartella `resources/slopsmith` dell\'app installata')
    ap.add_argument('--dev-root', default=os.path.dirname(here),
                    help='dove stanno i repo (il genitore di questo)')
    ap.add_argument('--plugins', nargs='*', default=None,
                    help='repo dei plugin; senza, i fratelli feedBack-plugin-*')
    ap.add_argument('--app', choices=['native', 'patched'], default=None,
                    help='i file dell\'app: di serie, o con i commit locali')
    ap.add_argument('--check', action='store_true',
                    help='di\' cosa c\'e\' ora, senza toccare niente')
    args = ap.parse_args()

    if not os.path.isdir(os.path.join(args.instance, 'plugins')):
        print('non sembra un\'istanza: manca %s/plugins' % args.instance, file=sys.stderr)
        return 2

    repos = args.plugins if args.plugins else find_plugin_repos(here)
    if not repos:
        print('nessun repo plugin trovato accanto a %s' % here, file=sys.stderr)
        return 2

    if args.check:
        check(args.dev_root, args.instance, repos)
        return 0

    print('istanza: %s' % args.instance)
    for repo in repos:
        pid, version, err = stage_plugin(repo, args.instance)
        if err:
            print('  %-14s %s' % (pid, err))
        else:
            print('  %-14s %s installato da %s'
                  % (pid, version, git_text(repo, 'rev-parse', '--short', 'HEAD')))

    if args.app:
        print('')
        for dst, note in set_app(args.dev_root, args.instance, args.app):
            print('  %-34s %s' % (dst, note))

    print('')
    print('riavvia l\'app: plugin.json e app.js si leggono all\'avvio.')
    return 0


if __name__ == '__main__':
    sys.exit(main())
