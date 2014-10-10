# bash completion support for avoscloud
# Copyright (C) 2014, AVOS Cloud <support@avoscloud.com>
# Distributed under the GNU General Public License, version 2.0.
# Usage:
#
#    1) Copy this file to somewhere (e.g. ~/.avoscloud_completion.sh).
#    2) Add the following line to your .bashrc/.bash_profile
#        source ~/.avoscloud_completion.sh
_apps()
{
  if [[ -a ".avoscloud/apps.json" ]]; then
    local words
    words=$(node -e "var obj=require('./.avoscloud/apps.json');for(var k in obj) console.log(k)")
    COMPREPLY=( $( compgen -W '$words' -- ${cur}))
  fi
}
_avoscloud()
{
    local cur prev
    _get_comp_words_by_ref cur prev
    COMPREPLY=()
    case $prev in
        -h|-V)
            return 0
            ;;
        -p|checkout)
            _apps
            return 0
            ;;
        -o|-r|-n)
            COMPREPLY=( $(compgen -f -- ${cur}) )
            return 0
            ;;
        upload)
            COMPREPLY=( $(compgen -f -d -- ${cur}) )
            return 0;
            ;;
        app)
            COMPREPLY=( $( compgen -W 'list' -- "$cur" ) )
            return 0;
            ;;
        -g)
            COMPREPLY=( $( compgen -W 'deploy -r' -- "$cur" ) )
            return 0
            ;;
        -l)
            COMPREPLY=( $( compgen -W 'deploy' -- "$cur" ) )
            return 0
            ;;
        -t)
            COMPREPLY=( $( compgen -W 'logs' -- "$cur" ) )
            return 0
            ;;
    esac

    if [[ "$cur" == -* ]]; then
        COMPREPLY=( $( compgen -W '-h -V -g -p -l -o -n
          -t -r ' -- "$cur" ) )
        return 0
    else
        COMPREPLY=( $( compgen -W 'deploy undeploy status search
            publish new logs clear upload app checkout add rm
           ' -- "$cur" ) )
        return 0
    fi
} &&
complete -F _avoscloud avoscloud
