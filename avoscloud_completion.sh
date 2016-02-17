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
        up)
            if [[ "$cur" == -* ]]; then
                COMPREPLY=( $( compgen -W '-d --debug -P --port' -- "$cur" ) )
                return 0
            fi
            ;;
        deploy)
            if [[ "$cur" == -* ]]; then
                COMPREPLY=( $( compgen -W '-o --log -g --git -r --revision --app' -- "$cur" ) )
                return 0
            fi
            ;;
        publish|status|undeploy|cql|upload|clear)
            if [[ "$cur" == -* ]]; then
                COMPREPLY=( $( compgen -W '--app' -- "$cur" ) )
                return 0
            fi
            ;;
        logs)
            if [[ "$cur" == -* ]]; then
                COMPREPLY=( $( compgen -W '-n --lines -t --tailf -e --env --app' -- "$cur" ) )
                return 0
            fi
            ;;
        app)
            COMPREPLY=( $( compgen -W 'list add checkout rm' -- "$cur" ) )
            return 0
            ;;
        checkout|rm)
            _apps
            return 0
            ;;
        redis)
            COMPREPLY=( $( compgen -W 'list conn' -- "$cur" ) )
            return 0
            ;;

        --app)
            _apps
            return 0
            ;;
        -e)
            COMPREPLY=( $( compgen -W 'stg prod' -- "$cur" ) )
            return 0
            ;;
    esac

    COMPREPLY=( $( compgen -W 'search new up deploy publish status undeploy
        logs app cql redis upload lint clear
       ' -- "$cur" ) )
    return 0
} &&
complete -F _avoscloud avoscloud
complete -F _avoscloud lean
